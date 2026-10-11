import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

/**
 * 일부 취소 창구 — 검증·미리보기·감사 로그·오류 모양.
 *
 * 금액과 장부는 cancel-items 가 본다. 여기서는 **창구가 그 함수를 올바르게 부르는가**다.
 */

const session = await vi.hoisted(async () => (await import('./support/session-mock')).sessionMock());
vi.mock('@shop/auth/session', () => session);
const getActor = session.getActor;

const recordAudit = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/audit', () => ({ recordAudit }));

const cache = await vi.hoisted(async () => (await import('./support/cache-mock')).cacheMock());
vi.mock('~/lib/cache', () => cache);
const revalidateCatalog = cache.revalidateCatalog;

const notifyAfterSale = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/orders/notify-after-sale', () => ({ notifyAfterSale }));

const lib = vi.hoisted(() => ({
  cancelOrderItems: vi.fn<(...a: any[]) => any>(),
  previewCancelItems: vi.fn<(...a: any[]) => any>(),
}));
vi.mock('~/lib/orders/cancel-items', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/orders/cancel-items')>();
  return { ...actual, ...lib };
});

const { CancelItemsError } = await import('~/lib/orders/cancel-items');
const { POST } = await import('~/app/api/orders/[orderNo]/cancel-items/route');

const customer: Actor = { id: 'u-1', role: 'CUSTOMER', merchantId: null };

const call = (body: unknown) =>
  POST(
    new Request('http://localhost/api/orders/20260914-0000001/cancel-items', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ orderNo: '20260914-0000001' }) },
  );

beforeEach(() => {
  vi.clearAllMocks();
  getActor.mockResolvedValue(customer);
  lib.cancelOrderItems.mockResolvedValue({
    orderNo: '20260914-0000001', kind: 'partial', refunded: 25_500, pointsReturned: 1_500, shippingDeducted: 0,
  });
  lib.previewCancelItems.mockResolvedValue({ kind: 'partial', cash: 25_500, points: 1_500, shippingDeducted: 0 });
});

describe('일부 취소 창구', () => {
  it('취소하고, 누가 무엇을 얼마나 돌려받았는지 남기고, 재고가 돌아온 카탈로그를 턴다', async () => {
    const response = await call({ itemIds: ['i-knit'], reason: '사이즈' });
    expect(response.status).toBe(200);
    expect(lib.cancelOrderItems).toHaveBeenCalledWith('20260914-0000001', ['i-knit'], customer, '사이즈');
    expect(recordAudit.mock.calls[0]![0]).toMatchObject({
      action: 'order.cancelItems', targetId: '20260914-0000001',
      after: { refunded: 25_500, itemIds: ['i-knit'] },
    });
    expect(revalidateCatalog).toHaveBeenCalled();
  });

  it('남는 상품이 없어 전체 취소가 됐으면 전체 취소로 적는다', async () => {
    lib.cancelOrderItems.mockResolvedValue({
      orderNo: '20260914-0000001', kind: 'full', refunded: 85_000, pointsReturned: 5_000, shippingDeducted: 0,
    });
    await call({ itemIds: ['a', 'b'], reason: '변심' });
    expect(recordAudit.mock.calls[0]![0].action).toBe('order.cancel');
  });

  it('미리보기는 아무것도 바꾸지 않고 기록도 남기지 않는다', async () => {
    const response = await call({ itemIds: ['i-knit'], reason: '변심', preview: true });
    expect(await response.json()).toEqual({ kind: 'partial', cash: 25_500, points: 1_500, shippingDeducted: 0 });
    expect(lib.cancelOrderItems).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
    expect(revalidateCatalog).not.toHaveBeenCalled();
  });

  it('고른 상품이 없거나 사유가 비면 부르지 않는다', async () => {
    expect((await call({ itemIds: [], reason: '변심' })).status).toBe(400);
    expect((await call({ itemIds: ['i-knit'], reason: '  ' })).status).toBe(400);
    expect(lib.cancelOrderItems).not.toHaveBeenCalled();
  });

  it('거절 사유를 그대로 전한다', async () => {
    lib.cancelOrderItems.mockRejectedValue(
      new CancelItemsError('SHIPPING_EXCEEDS_REFUND', '주문 전체를 취소해 주세요.'),
    );
    const response = await call({ itemIds: ['i-sock'], reason: '변심' });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ code: 'SHIPPING_EXCEEDS_REFUND', message: '주문 전체를 취소해 주세요.' });
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('취소하면 손님에게 알린다 — 일부면 고른 줄을, 전부가 됐으면 줄 전부를(줄을 넘기지 않는다)', async () => {
    await call({ itemIds: ['i-knit'], reason: '사이즈' });
    expect(notifyAfterSale).toHaveBeenCalledWith({
      kind: 'ORDER_CANCELLED', orderNo: '20260914-0000001', actorId: 'u-1', reason: '사이즈',
      itemIds: ['i-knit'], money: { refunded: 25_500, pointsReturned: 1_500, shippingDeducted: 0 },
    });
    notifyAfterSale.mockClear();
    lib.cancelOrderItems.mockResolvedValue({ orderNo: '20260914-0000001', kind: 'full', refunded: 85_000, pointsReturned: 0, shippingDeducted: 0 });
    await call({ itemIds: ['a', 'b'], reason: '변심' });
    expect(notifyAfterSale.mock.calls[0]![0].itemIds).toBeUndefined();
  });

  it('미리보기·거절이면 알리지 않는다', async () => {
    await call({ itemIds: ['i-knit'], reason: '변심', preview: true });
    lib.cancelOrderItems.mockRejectedValue(new CancelItemsError('SHIPPING_EXCEEDS_REFUND', 'x'));
    await call({ itemIds: ['i-sock'], reason: '변심' });
    expect(notifyAfterSale).not.toHaveBeenCalled();
  });

  it('로그인하지 않으면 401', async () => {
    getActor.mockResolvedValue(null);
    expect((await call({ itemIds: ['i-knit'], reason: '변심' })).status).toBe(401);
  });

  /**
   * **열쇠가 그대로 나가고 있었다.** 도메인 오류의 문구는 사전 열쇠이고(`err.cancelItems.notPaid`)
   * 번역은 응답을 만드는 자리에서 한다. 그런데 이 창구는 더 실을 것이 있어(결제 오류의
   * `retryable`) 말미를 손으로 만들었고, 그러면서 `error.message` 를 그대로 내보냈다 —
   * 화면은 받은 글자를 그대로 띄우므로 손님은 까닭 대신 `err.…` 를 봤다.
   */
  it('오류 문구는 열쇠가 아니라 사람의 말로 나간다', async () => {
    lib.cancelOrderItems.mockRejectedValue(
      new CancelItemsError('NOT_PAID', 'err.cancelItems.notPaid'),
    );

    const body = (await (await call({ itemIds: ['i-knit'], reason: '변심' })).json()) as {
      code: string; message: string;
    };

    expect(body.code).toBe('NOT_PAID');
    expect(body.message).not.toContain('err.');
    expect(body.message).toBe('결제가 끝난 주문만 일부 취소할 수 있습니다.');
  });

  /** 끼워 넣는 값도 번역거리다 — 주문 상태 이름이 열쇠로 실려 온다 */
  it('문구에 끼워 넣는 상태 이름도 사람의 말이 된다', async () => {
    lib.cancelOrderItems.mockRejectedValue(
      new CancelItemsError('NOT_CANCELLABLE', 'err.cancelItems.staffNotCancellable', 409, {
        status: 'orderStatus.SHIPPED',
      }),
    );

    const body = (await (await call({ itemIds: ['i-knit'], reason: '변심' })).json()) as { message: string };

    expect(body.message).toContain('배송중');
    expect(body.message).not.toContain('orderStatus.');
  });
});
