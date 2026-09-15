import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

/**
 * 손님 주문 취소 창구와 운영 상태 창구 — 취소·환불을 끝낸 뒤 손님에게 **한 번** 알리는가.
 *
 * 무엇을 어떻게 알리는지는 after-sale-notice 가 본다. 여기서는 창구가 알맞은 종류와 돈으로 부르는지, 막히면 안 부르는지다.
 */

const getActor = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/auth/session', () => ({ getActor }));
vi.mock('~/lib/audit', () => ({ recordAudit: vi.fn() }));
vi.mock('~/lib/cache', () => ({ revalidateCatalog: vi.fn() }));
const notifyAfterSale = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/orders/notify-after-sale', () => ({ notifyAfterSale }));

const cancelOrder = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/orders/cancel-order', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/lib/orders/cancel-order')>()),
  cancelOrder,
}));
const refundOrder = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/admin/refund-order', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/lib/admin/refund-order')>()),
  refundOrder,
}));
const transitionOrder = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/admin/transition-order', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/lib/admin/transition-order')>()),
  transitionOrder,
}));

const { CancelError } = await import('~/lib/orders/cancel-order');
const { POST: customerCancel } = await import('~/app/api/orders/[orderNo]/cancel/route');
const { POST: adminStatus } = await import('~/app/api/admin/orders/[orderNo]/status/route');

const customer: Actor = { id: 'u-1', role: 'CUSTOMER', merchantId: null };
const admin: Actor = { id: 'u-admin', role: 'ADMIN', merchantId: null };
const ORDER_NO = '20260915-0000001';
const params = { params: Promise.resolve({ orderNo: ORDER_NO }) };
const req = (body: unknown) => new Request(`http://localhost/x`, { method: 'POST', body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  cancelOrder.mockResolvedValue({ orderNo: ORDER_NO, status: 'CANCELLED', refunded: 50_000, pointsReturned: 1_000 });
  refundOrder.mockResolvedValue({ orderNo: ORDER_NO, orderStatus: 'REFUNDED', refunded: 50_000, stockRestored: 0, pointsReturned: 0, rewardReclaimed: 0 });
  transitionOrder.mockResolvedValue({ orderNo: ORDER_NO, orderStatus: 'PREPARING', itemsMoved: 1, waitingForOthers: false });
});

describe('손님 주문 취소', () => {
  it('취소하면 사유와 돌려받은 돈으로 알린다', async () => {
    getActor.mockResolvedValue(customer);
    await customerCancel(req({ reason: '다른 상품으로 다시 주문' }), params);
    expect(notifyAfterSale).toHaveBeenCalledWith({
      kind: 'ORDER_CANCELLED', orderNo: ORDER_NO, actorId: 'u-1', reason: '다른 상품으로 다시 주문',
      money: { refunded: 50_000, pointsReturned: 1_000, shippingDeducted: 0 },
    });
  });

  it('취소가 막히면 알리지 않는다', async () => {
    getActor.mockResolvedValue(customer);
    cancelOrder.mockRejectedValue(new CancelError('NOT_CANCELLABLE', '출고 뒤에는 반품으로', 409));
    await customerCancel(req({ reason: '변심' }), params);
    expect(notifyAfterSale).not.toHaveBeenCalled();
  });
});

describe('운영 상태 창구', () => {
  beforeEach(() => getActor.mockResolvedValue(admin));

  it('환불이면 환불 완료, 취소면 주문 취소를 알린다', async () => {
    await adminStatus(req({ to: 'REFUNDED' }), params);
    expect(notifyAfterSale).toHaveBeenCalledWith({
      kind: 'REFUND_COMPLETED', orderNo: ORDER_NO, actorId: 'u-admin',
      money: { refunded: 50_000, pointsReturned: 0, shippingDeducted: 0 },
    });
    notifyAfterSale.mockClear();
    await adminStatus(req({ to: 'CANCELLED', note: '재고 실사 누락' }), params);
    expect(notifyAfterSale.mock.calls[0]![0]).toMatchObject({ kind: 'ORDER_CANCELLED', actorId: 'u-admin', reason: '재고 실사 누락' });
  });

  it('다른 상태 옮기기는 여기서 알리지 않는다(출고·배송완료는 상태 전이가 알린다)', async () => {
    await adminStatus(req({ to: 'PREPARING' }), params);
    expect(notifyAfterSale).not.toHaveBeenCalled();
  });
});
