import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  order: { findMany: vi.fn<(...a: any[]) => any>(), updateMany: vi.fn<(...a: any[]) => any>() },
  orderItem: { updateMany: vi.fn<(...a: any[]) => any>() },
  orderStatusLog: { create: vi.fn<(...a: any[]) => any>() },
  pointTransaction: {
    findFirst: vi.fn<(...a: any[]) => any>(),
    create: vi.fn<(...a: any[]) => any>(),
  },
  user: { update: vi.fn<(...a: any[]) => any>() },
  $transaction: vi.fn<(...a: any[]) => any>(),
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const { autoConfirmDelivered } = await import('~/lib/orders/auto-confirm');

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-09-20T05:00:00+09:00');

const order = (over: Record<string, unknown> = {}) => ({
  id: 'o-1', orderNo: '20260901-0000001', status: 'DELIVERED', userId: 'u-1',
  deliveredAt: new Date(now.getTime() - 10 * DAY),
  rewardPoints: 2890,
  returnRequests: [],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.order.findMany.mockResolvedValue([order()]);
  db.order.updateMany.mockResolvedValue({ count: 1 });
  db.pointTransaction.findFirst.mockResolvedValue(null);
  db.$transaction.mockImplementation(async (fn: any) => fn(db));
});

describe('자동 확정', () => {
  it('기한이 지난 주문을 확정하고 적립을 준다', async () => {
    const r = await autoConfirmDelivered(now);

    expect(r).toMatchObject({ confirmed: 1, rewarded: 2890 });
    expect(db.order.updateMany.mock.calls[0]?.[0].data).toMatchObject({ status: 'CONFIRMED' });
    expect(db.pointTransaction.create).toHaveBeenCalled();
  });

  it('조회부터 기한을 걸어 온다 — 전부 읽어 와서 거르지 않는다', async () => {
    await autoConfirmDelivered(now);

    const where = db.order.findMany.mock.calls[0]?.[0].where;
    expect(where.status).toBe('DELIVERED');
    expect(where.deliveredAt.lte.getTime()).toBe(now.getTime() - 8 * DAY);
  });

  it('처리 전 반품 신청이 있으면 확정하지 않는다 — 확정은 되돌릴 수 없다', async () => {
    db.order.findMany.mockResolvedValue([order({ returnRequests: [{ id: 'r-1' }] })]);

    const r = await autoConfirmDelivered(now);

    expect(r).toMatchObject({ confirmed: 0, skipped: 1 });
    expect(db.order.updateMany).not.toHaveBeenCalled();
  });

  it('기한이 아직이면 건너뛴다', async () => {
    db.order.findMany.mockResolvedValue([
      order({ deliveredAt: new Date(now.getTime() - 3 * DAY) }),
    ]);

    const r = await autoConfirmDelivered(now);

    expect(r.confirmed).toBe(0);
  });

  it('그 사이 사람이 확정했으면 0건이 나오고 넘어간다', async () => {
    db.order.updateMany.mockResolvedValue({ count: 0 });

    const r = await autoConfirmDelivered(now);

    expect(r).toMatchObject({ confirmed: 0, skipped: 1 });
    // 적립도 나가지 않는다 — 두 번 주지 않는 것이 전부다
    expect(db.pointTransaction.create).not.toHaveBeenCalled();
  });

  it('상태 로그를 남긴다 — 사람이 아니라 배치가 바꿨다는 것이 보여야 한다', async () => {
    await autoConfirmDelivered(now);

    expect(db.orderStatusLog.create.mock.calls[0]?.[0].data).toMatchObject({
      from: 'DELIVERED', to: 'CONFIRMED', actor: 'system',
    });
  });
});

describe('한 건이 실패해도 배치는 계속한다', () => {
  it('실패한 건만 건너뛰고 나머지를 처리한다', async () => {
    db.order.findMany.mockResolvedValue([
      order({ id: 'o-bad', orderNo: '20260901-0000001' }),
      order({ id: 'o-ok', orderNo: '20260901-0000002' }),
    ]);
    let call = 0;
    db.$transaction.mockImplementation(async (fn: any) => {
      call += 1;
      if (call === 1) throw new Error('DB 오류');
      return fn(db);
    });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const r = await autoConfirmDelivered(now);

    expect(r).toMatchObject({ confirmed: 1, skipped: 1 });
    expect(r.orderNos).toEqual(['20260901-0000002']);
    spy.mockRestore();
  });
});

describe('한 번에 처리할 수를 제한한다', () => {
  it('서버리스는 중간에 끊긴다', async () => {
    await autoConfirmDelivered(now);

    expect(db.order.findMany.mock.calls[0]?.[0].take).toBe(200);
  });

  it('호출부가 줄일 수 있다', async () => {
    await autoConfirmDelivered(now, { limit: 10 });

    expect(db.order.findMany.mock.calls[0]?.[0].take).toBe(10);
  });
});
