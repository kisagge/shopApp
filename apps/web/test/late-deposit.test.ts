import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

/**
 * 취소한 주문에 들어온 입금 — 사람이 돌려준 뒤 닫는 자리, 그리고 그 주문을 찾는 목록·숫자.
 *
 * 가상계좌는 입금 뒤 환불에 손님 계좌가 있어야 해서 자동으로 못 돌려준다. 놓치지 않게 모으고, 돌려줬다는
 * 사실과 사람을 남긴다.
 */

const db = vi.hoisted(() => ({
  order: { findUnique: vi.fn<(...a: any[]) => any>() },
  payment: { updateMany: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const getActor = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/auth/session', () => ({ getActor }));
const recordAudit = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/audit', () => ({ recordAudit }));
const enforceRateLimit = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/rate-limit', () => ({ enforceRateLimit }));

const notifyLateDepositRefunded = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/notifications/late-deposit', () => ({ notifyLateDepositRefunded }));

const { resolveLateDeposit } = await import('~/lib/admin/late-deposit');
const { POST } = await import('~/app/api/admin/orders/[orderNo]/late-deposit/route');
const { adminOrderWhere, LATE_DEPOSIT_OPEN } = await import('~/lib/queries/admin/orders');

const admin: Actor = { id: 'u-a', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };
const NOW = new Date('2026-09-17T03:00:00Z');

const withPayment = (payment: Record<string, unknown> | null) => ({ userId: 'u-buyer', payment });
const open = { id: 'pay-1', lateDepositAt: new Date('2026-09-16T00:00:00Z'), lateDepositAmount: 289_000, lateDepositResolvedAt: null };

beforeEach(() => {
  vi.clearAllMocks();
  db.order.findUnique.mockResolvedValue(withPayment(open));
  db.payment.updateMany.mockResolvedValue({ count: 1 });
  getActor.mockResolvedValue(admin);
  enforceRateLimit.mockResolvedValue(null);
});

describe('돌려준 뒤 닫기', () => {
  it('닫은 시각과 사람을 남긴다', async () => {
    const result = await resolveLateDeposit(admin, 'O-1', NOW);

    expect(db.payment.updateMany).toHaveBeenCalledWith({
      where: { id: 'pay-1', lateDepositResolvedAt: null },
      data: { lateDepositResolvedAt: NOW, lateDepositResolvedBy: 'u-a' },
    });
    expect(result).toEqual({ orderNo: 'O-1', amount: 289_000, resolvedAt: NOW });
    // 계좌를 알려 주고 기다리던 손님이 끝났다는 것을 듣는다
    expect(notifyLateDepositRefunded).toHaveBeenCalledWith({ orderNo: 'O-1', userId: 'u-buyer', amount: 289_000 });
  });

  it('가맹점은 못 닫는다 — 받은 돈은 플랫폼 계좌에 있다', async () => {
    await expect(resolveLateDeposit(merchant, 'O-1', NOW)).rejects.toThrow(/order:refund/);
    expect(db.order.findUnique).not.toHaveBeenCalled();
  });

  it('없는 주문은 404', async () => {
    db.order.findUnique.mockResolvedValue(null);
    await expect(resolveLateDeposit(admin, 'O-x', NOW)).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND', status: 404 });
  });

  it('취소 뒤 입금이 없는 주문은 닫을 것이 없다', async () => {
    db.order.findUnique.mockResolvedValue(withPayment({ ...open, lateDepositAt: null }));
    await expect(resolveLateDeposit(admin, 'O-1', NOW)).rejects.toMatchObject({ code: 'NO_LATE_DEPOSIT' });
    expect(db.payment.updateMany).not.toHaveBeenCalled();
  });

  it('이미 닫았으면 다시 닫지 않는다', async () => {
    db.order.findUnique.mockResolvedValue(withPayment({ ...open, lateDepositResolvedAt: NOW }));
    await expect(resolveLateDeposit(admin, 'O-1', NOW)).rejects.toMatchObject({ code: 'ALREADY_RESOLVED', status: 409 });
  });

  it('두 사람이 동시에 눌러도 한 번만 닫힌다', async () => {
    db.payment.updateMany.mockResolvedValue({ count: 0 });
    await expect(resolveLateDeposit(admin, 'O-1', NOW)).rejects.toMatchObject({ code: 'ALREADY_RESOLVED' });
    // 진 쪽은 손님에게 또 알리지 않는다
    expect(notifyLateDepositRefunded).not.toHaveBeenCalled();
  });
});

describe('창구', () => {
  const call = () => POST(
    new Request('http://localhost/api/admin/orders/O-1/late-deposit', { method: 'POST' }),
    { params: Promise.resolve({ orderNo: 'O-1' }) },
  );

  it('닫으면 감사 로그에 금액과 함께 남긴다 — 돈이 오간 일이다', async () => {
    const response = await call();

    expect(response.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'order.resolveLateDeposit', targetType: 'order', targetId: 'O-1',
      after: expect.objectContaining({ amount: 289_000 }),
    }));
  });

  it('로그인해야 한다', async () => {
    getActor.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
  });

  it('가맹점은 403 이고 기록하지 않는다', async () => {
    getActor.mockResolvedValue(merchant);
    expect((await call()).status).toBe(403);
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('이미 닫았으면 409', async () => {
    db.order.findUnique.mockResolvedValue(withPayment({ ...open, lateDepositResolvedAt: NOW }));
    expect((await call()).status).toBe(409);
  });
});

describe('찾는 조건', () => {
  it('아직 돌려주지 않은 것만 — 돌려준 것은 목록에서 빠진다', () => {
    expect(LATE_DEPOSIT_OPEN).toEqual({ lateDepositAt: { not: null }, lateDepositResolvedAt: null });
  });

  it('운영진 목록에서만 건다', () => {
    expect(adminOrderWhere(null, { lateDeposit: true })).toMatchObject({ payment: { is: LATE_DEPOSIT_OPEN } });
  });

  it('가맹점 범위에서는 걸지 않는다 — 가맹점은 결제를 보지 않는다', () => {
    expect(adminOrderWhere('m-a', { lateDeposit: true })).not.toHaveProperty('payment');
  });

  it('조건을 안 걸면 결제로 거르지 않는다', () => {
    expect(adminOrderWhere(null, {})).not.toHaveProperty('payment');
  });
});
