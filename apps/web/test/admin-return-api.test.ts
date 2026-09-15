import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

/**
 * 운영 반품 창구 — 승인·반려에 "회수 확인 · 환불" 이 더해졌다.
 *
 * 돈이 나가는 동작이라 감사 로그와 카탈로그 캐시(돌아온 재고)를 함께 본다.
 */

const getActor = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/auth/session', () => ({ getActor }));
const recordAudit = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/audit', () => ({ recordAudit }));
const revalidateCatalog = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/cache', () => ({ revalidateCatalog }));
const notifyAfterSale = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/orders/notify-after-sale', () => ({ notifyAfterSale }));

const completeReturn = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/orders/complete-return', () => ({ completeReturn }));
const completeExchange = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/orders/complete-exchange', () => ({ completeExchange }));
const resolveReturn = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
const receiveReturn = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/orders/return-request', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/lib/orders/return-request')>()),
  resolveReturn,
  receiveReturn,
}));

const { ReturnError } = await import('~/lib/orders/return-request');
const { POST } = await import('~/app/api/admin/orders/[orderNo]/return/route');

const admin: Actor = { id: 'u-a', role: 'ADMIN', merchantId: null };

const call = (body: unknown) =>
  POST(
    new Request('http://localhost/api/admin/orders/20260914-0000002/return', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ orderNo: '20260914-0000002' }) },
  );

beforeEach(() => {
  vi.clearAllMocks();
  getActor.mockResolvedValue(admin);
  completeReturn.mockResolvedValue({ orderNo: '20260914-0000002', kind: 'partial', refunded: 24_000, pointsReturned: 0, shippingDeducted: 3_000, orderStatus: 'DELIVERED' });
  resolveReturn.mockResolvedValue({ orderNo: '20260914-0000002', status: 'APPROVED', orderStatus: 'RETURN_REQUESTED' });
  receiveReturn.mockResolvedValue({ orderNo: '20260914-0000002', receivedAt: new Date('2026-09-15T01:00:00Z') });
});

describe('운영 반품 창구', () => {
  it('회수 확인이면 돌려주고, 누가 얼마를 돌려줬는지 남기고, 카탈로그를 턴다', async () => {
    const response = await call({ action: 'COMPLETE' });
    expect(response.status).toBe(200);
    expect(completeReturn).toHaveBeenCalledWith('20260914-0000002', admin);
    expect(resolveReturn).not.toHaveBeenCalled();
    expect(recordAudit.mock.calls[0]![0]).toMatchObject({ action: 'order.completeReturn', after: { refunded: 24_000 } });
    expect(revalidateCatalog).toHaveBeenCalled();
  });

  it('승인은 돈을 움직이지 않는다 — 회수 확인을 부르지 않는다', async () => {
    await call({ action: 'APPROVE' });
    expect(resolveReturn).toHaveBeenCalled();
    expect(completeReturn).not.toHaveBeenCalled();
    expect(revalidateCatalog).not.toHaveBeenCalled();
  });

  it('승인 안 된 신청이면 거절 사유를 그대로 전하고 기록하지 않는다', async () => {
    completeReturn.mockRejectedValue(new ReturnError('NOT_APPROVED', '승인한 신청만 회수 확인할 수 있습니다.'));
    const response = await call({ action: 'COMPLETE' });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'NOT_APPROVED' });
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('도착 확인은 누가 확인했는지 남기고, 돈도 재고도 건드리지 않는다', async () => {
    const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };
    getActor.mockResolvedValue(merchant);
    const response = await call({ action: 'RECEIVE' });
    expect(response.status).toBe(200);
    expect(receiveReturn).toHaveBeenCalledWith('20260914-0000002', merchant);
    expect(completeReturn).not.toHaveBeenCalled();
    expect(recordAudit.mock.calls[0]![0]).toMatchObject({ action: 'order.receiveReturn', actor: merchant });
    // 재고는 환불할 때 돌아온다 — 도착 확인만으로 카탈로그를 털 이유가 없다
    expect(revalidateCatalog).not.toHaveBeenCalled();
  });

  it('교환 상품 발송은 교환 처리를 부르고 송장을 감사 로그에 남긴다 — 환불은 부르지 않는다', async () => {
    completeExchange.mockResolvedValue({ orderNo: '20260914-0000002', orderStatus: 'DELIVERED', exchanged: 1 });
    const response = await call({ action: 'SHIP_EXCHANGE', carrier: 'CJ', trackingNumber: '123456789012' });
    expect(response.status).toBe(200);
    expect(completeExchange).toHaveBeenCalledWith('20260914-0000002', { action: 'SHIP_EXCHANGE', carrier: 'CJ', trackingNumber: '123456789012' }, admin);
    expect(completeReturn).not.toHaveBeenCalled();
    expect(recordAudit.mock.calls[0]![0]).toMatchObject({ action: 'order.shipExchange', after: { carrier: 'CJ', exchanged: 1 } });
    expect(revalidateCatalog).toHaveBeenCalled();
  });

  it('교환 송장 형식이 틀리면 부르지 않는다', async () => {
    const response = await call({ action: 'SHIP_EXCHANGE', carrier: 'CJ', trackingNumber: '12-34' });
    expect(response.status).toBe(400);
    expect(completeExchange).not.toHaveBeenCalled();
  });

  it('회수 확인·환불이면 손님에게 환불 완료를 한 번 알린다 — 돌려준 돈을 함께', async () => {
    await call({ action: 'COMPLETE' });
    expect(notifyAfterSale).toHaveBeenCalledTimes(1);
    expect(notifyAfterSale).toHaveBeenCalledWith({
      kind: 'REFUND_COMPLETED', orderNo: '20260914-0000002', actorId: 'u-a',
      money: { refunded: 24_000, pointsReturned: 0, shippingDeducted: 3_000 },
    });
  });

  it('승인·반려는 그 결과를 알리고, 도착 확인은 알리지 않는다(손님이 할 일이 없다)', async () => {
    await call({ action: 'APPROVE' });
    expect(notifyAfterSale.mock.calls[0]![0]).toMatchObject({ kind: 'RETURN_APPROVED', orderNo: '20260914-0000002' });
    notifyAfterSale.mockClear();
    await call({ action: 'REJECT', rejectReason: '착용 흔적' });
    expect(notifyAfterSale.mock.calls[0]![0]).toMatchObject({ kind: 'RETURN_REJECTED' });
    notifyAfterSale.mockClear();
    await call({ action: 'RECEIVE' });
    expect(notifyAfterSale).not.toHaveBeenCalled();
  });

  it('처리가 막히면 알리지 않는다', async () => {
    completeReturn.mockRejectedValue(new ReturnError('NOT_APPROVED', '승인한 신청만'));
    await call({ action: 'COMPLETE' });
    expect(notifyAfterSale).not.toHaveBeenCalled();
  });
});
