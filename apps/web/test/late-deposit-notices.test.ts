import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 취소한 주문에 들어온 입금을 알린다 — 돈을 보낸 손님에게, 돌려줄 수 있는 운영진에게.
 *
 * 받은 돈을 적어 두고 운영 대시보드에만 띄웠다. 누가 듣는지, 무엇이 실리는지, 실패해도 던지지 않는지 본다.
 */

vi.mock('server-only', () => ({}));
const db = vi.hoisted(() => ({
  user: { findMany: vi.fn<(...a: any[]) => any>() },
  notification: { createMany: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const { notifyLateDepositFound, notifyLateDepositRefunded } = await import('~/lib/notifications/late-deposit');

const written = () => db.notification.createMany.mock.calls[0]![0].data as Record<string, unknown>[];

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findMany.mockResolvedValue([{ id: 'u-staff' }]);
  db.notification.createMany.mockResolvedValue({ count: 2 });
});

describe('입금이 들어왔을 때', () => {
  it('손님은 계좌를 알려 줄 주문 화면으로, 운영진은 환불 처리하는 자리로 간다', async () => {
    await notifyLateDepositFound({ orderNo: '20260917-0000001', userId: 'u-buyer', amount: 289_000 });

    expect(written()).toEqual([
      {
        userId: 'u-buyer', kind: 'LATE_DEPOSIT_RECEIVED',
        params: { orderNo: '20260917-0000001', amount: '289,000' }, linkPath: '/order/20260917-0000001',
      },
      {
        userId: 'u-staff', kind: 'LATE_DEPOSIT_FOUND',
        params: { orderNo: '20260917-0000001', amount: '289,000' }, linkPath: '/admin/orders/20260917-0000001',
      },
    ]);
  });

  it('운영진은 환불할 수 있는 역할만, 정지된 계정은 빼고 — 가맹점에게는 가지 않는다(받은 돈은 플랫폼 계좌에 있다)', async () => {
    await notifyLateDepositFound({ orderNo: 'O-1', userId: 'u-buyer', amount: 1_000 });

    expect(db.user.findMany.mock.calls[0]![0].where).toEqual({
      suspendedAt: null, role: { in: ['ADMIN', 'SUPER_ADMIN'] },
    });
  });

  it('받을 운영진이 없어도 손님에게는 간다', async () => {
    db.user.findMany.mockResolvedValue([]);
    await notifyLateDepositFound({ orderNo: 'O-1', userId: 'u-buyer', amount: 1_000 });
    expect(written()).toHaveLength(1);
    expect(written()[0]).toMatchObject({ userId: 'u-buyer' });
  });

  it('알림을 못 남겨도 던지지 않는다 — 입금은 이미 적혔고 웹훅을 실패시키면 안 된다', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.user.findMany.mockRejectedValue(new Error('db down'));

    await expect(notifyLateDepositFound({ orderNo: 'O-1', userId: 'u-buyer', amount: 1_000 })).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe('돌려주었을 때', () => {
  it('손님에게만, 금액과 함께', async () => {
    await notifyLateDepositRefunded({ orderNo: 'O-1', userId: 'u-buyer', amount: 50_000 });

    expect(written()).toEqual([{
      userId: 'u-buyer', kind: 'LATE_DEPOSIT_REFUNDED', params: { orderNo: 'O-1', amount: '50,000' }, linkPath: '/order/O-1',
    }]);
    expect(db.user.findMany).not.toHaveBeenCalled();
  });
});
