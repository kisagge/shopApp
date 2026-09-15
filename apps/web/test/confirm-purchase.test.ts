import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 손님의 구매확정 — 자기 주문·배송완료·반품 없음, 적립은 한 번. 창구와 함께 본다.
 */

const db = vi.hoisted(() => ({
  order: { findFirst: vi.fn<(...a: any[]) => any>(), updateMany: vi.fn<(...a: any[]) => any>() },
  orderItem: { updateMany: vi.fn<(...a: any[]) => any>() },
  orderStatusLog: { create: vi.fn<(...a: any[]) => any>() },
  pointTransaction: { findFirst: vi.fn<(...a: any[]) => any>(), create: vi.fn<(...a: any[]) => any>() },
  user: { update: vi.fn<(...a: any[]) => any>() },
  $transaction: vi.fn<(...a: any[]) => any>(),
}));
vi.mock('@shop/db', () => ({ prisma: db }));
const getSessionUser = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/auth/session', () => ({ getSessionUser }));
const enforceRateLimit = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/rate-limit', () => ({ enforceRateLimit }));

const { confirmPurchase } = await import('~/lib/orders/confirm-purchase');
const { POST } = await import('~/app/api/orders/[orderNo]/purchase-confirm/route');

const NOW = new Date('2026-09-15T03:00:00Z');
const order = (over: Record<string, unknown> = {}) => ({
  id: 'o-1', orderNo: '20260915-0000001', userId: 'u-1', status: 'DELIVERED', rewardPoints: 1_190, returnRequests: [], ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.order.findFirst.mockResolvedValue(order());
  db.order.updateMany.mockResolvedValue({ count: 1 });
  db.pointTransaction.findFirst.mockResolvedValue(null);
  db.$transaction.mockImplementation(async (fn: any) => fn(db));
  getSessionUser.mockResolvedValue({ id: 'u-1' });
  enforceRateLimit.mockResolvedValue(null);
});

describe('구매확정', () => {
  it('자기 주문을 배송완료에서 확정으로 조건부로 옮기고, 줄·이력·적립을 함께 — 기한을 기다리지 않는다', async () => {
    const result = await confirmPurchase('20260915-0000001', { id: 'u-1' }, NOW);

    expect(db.order.findFirst.mock.calls[0]![0].where).toEqual({ orderNo: '20260915-0000001', userId: 'u-1' });
    expect(db.order.updateMany).toHaveBeenCalledWith({ where: { id: 'o-1', status: 'DELIVERED' }, data: { status: 'CONFIRMED', confirmedAt: NOW } });
    expect(db.orderItem.updateMany).toHaveBeenCalledWith({ where: { orderId: 'o-1', canceledAt: null }, data: { status: 'CONFIRMED' } });
    expect(db.orderStatusLog.create.mock.calls[0]![0].data).toMatchObject({ from: 'DELIVERED', to: 'CONFIRMED', actor: 'u-1', note: '손님이 구매확정' });
    expect(db.pointTransaction.create.mock.calls[0]![0].data).toMatchObject({ userId: 'u-1', amount: 1_190, reason: 'EARN_PURCHASE', orderId: 'o-1' });
    expect(result).toEqual({ orderNo: '20260915-0000001', rewarded: 1_190 });
  });

  it('남의 주문은 없는 주문, 배송완료가 아니거나 처리 전 반품이 있으면 거절한다', async () => {
    db.order.findFirst.mockResolvedValue(null);
    await expect(confirmPurchase('x', { id: 'u-2' }, NOW)).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND', status: 404 });
    db.order.findFirst.mockResolvedValue(order({ status: 'SHIPPED' }));
    await expect(confirmPurchase('x', { id: 'u-1' }, NOW)).rejects.toMatchObject({ code: 'NOT_CONFIRMABLE', status: 409 });
    db.order.findFirst.mockResolvedValue(order({ returnRequests: [{ id: 'rr-1' }] }));
    await expect(confirmPurchase('x', { id: 'u-1' }, NOW)).rejects.toMatchObject({ code: 'NOT_CONFIRMABLE' });
    expect(db.order.updateMany).not.toHaveBeenCalled();
  });

  it('그 사이 자동 확정이 먼저 했으면(조건부 0건) 적립 없이 거절한다 — 적립이 두 번 나가지 않는다', async () => {
    db.order.updateMany.mockResolvedValue({ count: 0 });
    await expect(confirmPurchase('x', { id: 'u-1' }, NOW)).rejects.toMatchObject({ code: 'NOT_CONFIRMABLE' });
    expect(db.pointTransaction.create).not.toHaveBeenCalled();
  });
});

describe('창구', () => {
  const call = () =>
    POST(new Request('http://localhost/api/orders/20260915-0000001/purchase-confirm', { method: 'POST' }), {
      params: Promise.resolve({ orderNo: '20260915-0000001' }),
    });

  it('확정 결과를 주고, 로그인 없으면 401, 요청 제한이면 확정하지 않는다', async () => {
    const ok = await call();
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ orderNo: '20260915-0000001', rewarded: 1_190 });

    getSessionUser.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
    getSessionUser.mockResolvedValue({ id: 'u-1' });
    enforceRateLimit.mockResolvedValue(new Response(null, { status: 429 }));
    expect((await call()).status).toBe(429);
    expect(db.order.updateMany).toHaveBeenCalledTimes(1);
  });

  it('확정할 수 없으면 그 이유를 전한다', async () => {
    db.order.findFirst.mockResolvedValue(order({ status: 'CONFIRMED' }));
    const response = await call();
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'NOT_CONFIRMABLE' });
  });
});
