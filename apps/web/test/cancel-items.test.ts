import { describe, it, expect, vi, beforeEach } from 'vitest';
import { won, PaymentError, type Actor, type PaymentGateway } from '@shop/core';

/**
 * 일부 상품 취소 — 돈과 장부가 맞는가.
 *
 * 계산 규칙(쿠폰·포인트 몫, 배송비 차감)은 core 의 partial-cancel 검사가 본다. 여기서 보는 것은
 * **그 계산이 실제로 어디에 적히는가**다: PG 에 얼마를, 어느 줄을 취소로, 재고·포인트·적립을
 * 얼마나, 그리고 한 번에 한 요청만.
 */

const recordServerEvent = vi.hoisted(() => vi.fn<(...a: any[]) => any>(() => Promise.resolve()));
vi.mock('~/lib/analytics/server', () => ({ recordServerEvent }));

const cancelOrder = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/orders/cancel-order', () => ({ cancelOrder, CancelError: class extends Error {} }));

const getShippingPolicy = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/shipping-policy', () => ({ getShippingPolicy }));

const payments = vi.hoisted(() => ({ getPaymentGateway: vi.fn<(...a: any[]) => any>() }));
vi.mock('~/lib/payments', () => payments);

const tx = vi.hoisted(() => ({
  $queryRaw: vi.fn<(...a: any[]) => any>(),
  order: { findFirst: vi.fn<(...a: any[]) => any>(), update: vi.fn<(...a: any[]) => any>() },
  orderItem: { updateMany: vi.fn<(...a: any[]) => any>() },
  productVariant: { updateMany: vi.fn<(...a: any[]) => any>() },
  user: { update: vi.fn<(...a: any[]) => any>() },
  pointTransaction: { create: vi.fn<(...a: any[]) => any>(), findFirst: vi.fn<(...a: any[]) => any>() },
  payment: { update: vi.fn<(...a: any[]) => any>() },
  orderRefund: { create: vi.fn<(...a: any[]) => any>(), aggregate: vi.fn<(...a: any[]) => any>() },
  orderStatusLog: { create: vi.fn<(...a: any[]) => any>() },
}));
const db = vi.hoisted(() => ({
  order: { findFirst: vi.fn<(...a: any[]) => any>() },
  orderRefund: { aggregate: vi.fn<(...a: any[]) => any>() },
  pointTransaction: { findFirst: vi.fn<(...a: any[]) => any>() },
  $transaction: vi.fn<(...a: any[]) => any>(),
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const { cancelOrderItems, previewCancelItems, CancelItemsError } = await import('~/lib/orders/cancel-items');

const customer: Actor = { id: 'u-1', role: 'CUSTOMER', merchantId: null };
const admin: Actor = { id: 'u-admin', role: 'ADMIN', merchantId: null };

const NO_REFUNDS = { _sum: { amount: null, points: null, shippingDeducted: null }, _count: { _all: 0 } };

/**
 * 코트 60,000 · 니트 30,000 · 양말 10,000, 쿠폰 10,000(전 줄 대상), 포인트 5,000, 무료배송.
 * 몫은 주문 때 박힌 값이다.
 */
const order = (over: Record<string, unknown> = {}) => ({
  id: 'o-1', orderNo: '20260914-0000001', status: 'PAID', userId: 'u-1', browserSessionId: 's-1',
  couponDiscount: 10_000, pointsUsed: 5_000, rewardPoints: 850, shippingFee: 0, isRemoteArea: false,
  payable: 85_000,
  shippingPolicy: { baseFee: 3000, freeThreshold: 50_000, remoteSurcharge: 3000 },
  items: [
    { id: 'i-coat', variantId: 'v-coat', merchantId: 'm-a', quantity: 1, subtotal: 60_000, status: 'PAID',
      couponShare: 6_000, pointsShare: 3_000, rewardShare: 510, canceledAt: null },
    { id: 'i-knit', variantId: 'v-knit', merchantId: 'm-a', quantity: 2, subtotal: 30_000, status: 'PAID',
      couponShare: 3_000, pointsShare: 1_500, rewardShare: 255, canceledAt: null },
    { id: 'i-sock', variantId: 'v-sock', merchantId: 'm-b', quantity: 1, subtotal: 10_000, status: 'PAID',
      couponShare: 1_000, pointsShare: 500, rewardShare: 85, canceledAt: null },
  ],
  payment: { id: 'p-1', status: 'DONE', method: 'CARD', pgPaymentKey: 'pk_1', refundedAmount: 0 },
  ...over,
});

const gateway = (): PaymentGateway => ({
  provider: 'mock',
  inquire: vi.fn<(...a: any[]) => any>(),
  confirm: vi.fn<(...a: any[]) => any>(),
  cancel: vi.fn<(...a: any[]) => any>(async () => ({
    paymentKey: 'pk_1', approvalNo: null, method: 'CARD' as const, status: 'PARTIAL_CANCELED' as const,
    amount: won(0), approvedAt: null, virtualAccount: null, raw: {},
  })),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  db.order.findFirst.mockResolvedValue(order());
  tx.order.findFirst.mockResolvedValue(order());
  db.orderRefund.aggregate.mockResolvedValue(NO_REFUNDS);
  tx.orderRefund.aggregate.mockResolvedValue(NO_REFUNDS);
  db.pointTransaction.findFirst.mockResolvedValue(null);
  tx.pointTransaction.findFirst.mockResolvedValue(null);
  tx.orderItem.updateMany.mockImplementation(async (args: { where: { id: { in: string[] } } }) => ({
    count: args.where.id.in.length,
  }));
  db.$transaction.mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx));
  getShippingPolicy.mockResolvedValue({ baseFee: 9_999, freeThreshold: 1_000_000, remoteSurcharge: 0 });
});

describe('돈', () => {
  it('고른 줄의 몫만큼 PG 에 부분 취소를 보낸다', async () => {
    const pg = gateway();
    const result = await cancelOrderItems('20260914-0000001', ['i-knit'], customer, '사이즈', pg);

    // 30,000 − 쿠폰 3,000 − 포인트 1,500. 남는 70,000 은 무료배송 기준을 넘는다
    expect(vi.mocked(pg.cancel).mock.calls[0]![0]).toMatchObject({ paymentKey: 'pk_1', amount: 25_500 });
    expect(result).toMatchObject({ kind: 'partial', refunded: 25_500, pointsReturned: 1_500, shippingDeducted: 0 });
  });

  it('남는 상품이 무료배송 기준 아래로 떨어지면 배송비를 떼고 보낸다', async () => {
    const pg = gateway();
    await cancelOrderItems('20260914-0000001', ['i-coat'], customer, '변심', pg);
    // 60,000 − 6,000 − 3,000 − 배송비 3,000. 남는 것은 40,000
    expect(vi.mocked(pg.cancel).mock.calls[0]![0].amount).toBe(48_000);
    expect(tx.orderRefund.create.mock.calls[0]![0].data).toMatchObject({
      amount: 48_000, points: 3_000, shippingDeducted: 3_000, kind: 'PARTIAL_CANCEL', itemIds: ['i-coat'],
    });
  });

  it('주문 때의 배송비 기준을 쓴다 — 오늘 바뀐 정책으로 지난 주문을 계산하지 않는다', async () => {
    await cancelOrderItems('20260914-0000001', ['i-knit'], customer, '변심', gateway());
    expect(getShippingPolicy).not.toHaveBeenCalled();
  });

  it('옛 주문(정책 스냅샷 없음)은 지금 정책을 쓴다', async () => {
    tx.order.findFirst.mockResolvedValue(order({ shippingPolicy: null }));
    db.order.findFirst.mockResolvedValue(order({ shippingPolicy: null }));
    await cancelOrderItems('20260914-0000001', ['i-knit'], customer, '변심', gateway());
    expect(getShippingPolicy).toHaveBeenCalled();
  });

  it('같은 줄 묶음이면 순서가 달라도 같은 멱등 키다 — 다시 눌러도 돈은 한 번 나간다', async () => {
    const a = gateway();
    const b = gateway();
    await cancelOrderItems('20260914-0000001', ['i-knit', 'i-sock'], customer, '변심', a);
    await cancelOrderItems('20260914-0000001', ['i-sock', 'i-knit'], customer, '변심', b);
    expect(vi.mocked(a.cancel).mock.calls[0]![0].idempotencyKey)
      .toBe(vi.mocked(b.cancel).mock.calls[0]![0].idempotencyKey);
  });

  it('앞서 뗀 배송비는 다시 떼지 않는다', async () => {
    tx.orderRefund.aggregate.mockResolvedValue({
      _sum: { amount: 48_000, points: 3_000, shippingDeducted: 3_000 }, _count: { _all: 1 },
    });
    tx.order.findFirst.mockResolvedValue(order({
      items: order().items.map((i) => (i.id === 'i-coat' ? { ...i, status: 'CANCELLED', canceledAt: new Date() } : i)),
    }));
    const pg = gateway();
    await cancelOrderItems('20260914-0000001', ['i-knit'], customer, '변심', pg);
    expect(vi.mocked(pg.cancel).mock.calls[0]![0].amount).toBe(25_500);
  });
});

describe('장부', () => {
  it('고른 줄만 취소로 적고, 그 줄의 재고만 돌려준다', async () => {
    await cancelOrderItems('20260914-0000001', ['i-knit'], customer, '변심', gateway());
    expect(tx.orderItem.updateMany.mock.calls[0]![0]).toMatchObject({
      where: { id: { in: ['i-knit'] }, canceledAt: null },
      data: { status: 'CANCELLED' },
    });
    expect(tx.productVariant.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.productVariant.updateMany).toHaveBeenCalledWith({
      where: { id: 'v-knit' }, data: { stock: { increment: 2 } },
    });
  });

  it('포인트 몫은 원장과 함께 돌려주고, 구매확정 적립은 그 줄 몫만큼 줄인다', async () => {
    await cancelOrderItems('20260914-0000001', ['i-knit'], customer, '변심', gateway());
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 'u-1' }, data: { pointBalance: { increment: 1_500 } } });
    expect(tx.pointTransaction.create.mock.calls[0]![0].data).toMatchObject({ amount: 1_500, reason: 'CANCEL_REFUND' });
    expect(tx.order.update).toHaveBeenCalledWith({ where: { id: 'o-1' }, data: { rewardPoints: { decrement: 255 } } });
  });

  it('결제는 부분 취소 상태가 되고 환불 누계가 는다', async () => {
    await cancelOrderItems('20260914-0000001', ['i-knit'], customer, '변심', gateway());
    expect(tx.payment.update.mock.calls[0]![0].data).toEqual({ status: 'PARTIAL_CANCELED', refundedAmount: 25_500 });
  });

  it('주문을 잠그고, 잠근 뒤에 다시 읽어 계산한다 — 동시에 다른 줄을 취소해도 배송비가 어긋나지 않는다', async () => {
    await cancelOrderItems('20260914-0000001', ['i-knit'], customer, '변심', gateway());
    const sql = (tx.$queryRaw.mock.calls[0]![0] as TemplateStringsArray).join('?');
    expect(sql).toContain('FOR UPDATE');
    expect(tx.order.findFirst).toHaveBeenCalled();
    expect(tx.orderRefund.aggregate).toHaveBeenCalled();
    expect(tx.$queryRaw.mock.invocationCallOrder[0]!).toBeLessThan(tx.orderRefund.aggregate.mock.invocationCallOrder[0]!);
  });

  it('PG 가 거절하면 아무것도 적지 않는다', async () => {
    const pg = gateway();
    vi.mocked(pg.cancel).mockRejectedValue(new PaymentError('REJECT', '거절', false));
    await expect(cancelOrderItems('20260914-0000001', ['i-knit'], customer, '변심', pg)).rejects.toThrow('거절');
    expect(tx.orderItem.updateMany).not.toHaveBeenCalled();
    expect(tx.orderRefund.create).not.toHaveBeenCalled();
  });

  it('PG 가 돌려준 뒤 장부에 못 적으면 크게 남기고 던진다', async () => {
    tx.orderItem.updateMany.mockResolvedValue({ count: 0 });
    await expect(cancelOrderItems('20260914-0000001', ['i-knit'], customer, '변심', gateway()))
      .rejects.toMatchObject({ code: 'ALREADY_PROCESSED' });
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('수동 대사'), expect.objectContaining({ orderNo: '20260914-0000001' }), expect.anything(),
    );
  });

  it('포인트로만 낸 몫이면 PG 를 부르지 않는다', async () => {
    tx.order.findFirst.mockResolvedValue(order({
      items: order().items.map((i) => (i.id === 'i-sock' ? { ...i, couponShare: 0, pointsShare: 10_000 } : i)),
    }));
    const pg = gateway();
    await cancelOrderItems('20260914-0000001', ['i-sock'], customer, '변심', pg);
    expect(pg.cancel).not.toHaveBeenCalled();
  });
});

describe('누가 · 언제', () => {
  it('남는 상품이 없게 고르면 주문 전체 취소로 넘긴다', async () => {
    cancelOrder.mockResolvedValue({ orderNo: '20260914-0000001', status: 'REFUNDED', refunded: 85_000, pointsReturned: 5_000 });
    const result = await cancelOrderItems('20260914-0000001', ['i-coat', 'i-knit', 'i-sock'], customer, '변심', gateway());
    expect(cancelOrder).toHaveBeenCalledWith('20260914-0000001', customer, '변심', expect.anything());
    expect(result.kind).toBe('full');
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('손님은 배송 준비가 시작되면 일부 취소할 수 없고, 운영진은 할 수 있다', async () => {
    tx.order.findFirst.mockResolvedValue(order({ status: 'PREPARING' }));
    db.order.findFirst.mockResolvedValue(order({ status: 'PREPARING' }));
    await expect(cancelOrderItems('20260914-0000001', ['i-knit'], customer, '변심', gateway()))
      .rejects.toMatchObject({ code: 'NOT_CANCELLABLE' });
    await expect(cancelOrderItems('20260914-0000001', ['i-knit'], admin, '품절', gateway())).resolves.toMatchObject({ kind: 'partial' });
  });

  it('손님은 자기 주문만 찾는다', async () => {
    await cancelOrderItems('20260914-0000001', ['i-knit'], customer, '변심', gateway());
    expect(db.order.findFirst.mock.calls[0]![0].where).toEqual({ orderNo: '20260914-0000001', userId: 'u-1' });
  });

  it('가상계좌·미결제는 일부 취소하지 않는다', async () => {
    tx.order.findFirst.mockResolvedValue(order({ payment: { ...order().payment, method: 'VIRTUAL_ACCOUNT' } }));
    await expect(cancelOrderItems('20260914-0000001', ['i-knit'], customer, '변심', gateway()))
      .rejects.toMatchObject({ code: 'VIRTUAL_ACCOUNT' });

    tx.order.findFirst.mockResolvedValue(order({ payment: { ...order().payment, status: 'READY', pgPaymentKey: null } }));
    await expect(cancelOrderItems('20260914-0000001', ['i-knit'], customer, '변심', gateway()))
      .rejects.toMatchObject({ code: 'NOT_PAID' });
  });

  it('출고된 줄은 고를 수 없다', async () => {
    tx.order.findFirst.mockResolvedValue(order({
      status: 'PREPARING',
      items: order().items.map((i) => (i.id === 'i-knit' ? { ...i, status: 'SHIPPED' } : i)),
    }));
    await expect(cancelOrderItems('20260914-0000001', ['i-knit'], admin, '변심', gateway()))
      .rejects.toMatchObject({ code: 'ITEM_SHIPPED' });
  });

  it('없는 주문은 404', async () => {
    db.order.findFirst.mockResolvedValue(null);
    await expect(cancelOrderItems('x', ['i-knit'], customer, '변심', gateway())).rejects.toBeInstanceOf(CancelItemsError);
  });
});

describe('미리보기', () => {
  it('금액만 주고 아무것도 바꾸지 않는다', async () => {
    const preview = await previewCancelItems('20260914-0000001', ['i-coat'], customer);
    expect(preview).toEqual({ kind: 'partial', cash: 48_000, points: 3_000, shippingDeducted: 3_000 });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(payments.getPaymentGateway).not.toHaveBeenCalled();
  });

  it('전부 고르면 주문 전체 취소의 금액을 준다 — 앞서 돌려준 만큼 뺀다', async () => {
    db.orderRefund.aggregate.mockResolvedValue({
      _sum: { amount: 25_500, points: 1_500, shippingDeducted: 0 }, _count: { _all: 1 },
    });
    db.order.findFirst.mockResolvedValue(order({
      items: order().items.map((i) => (i.id === 'i-knit' ? { ...i, status: 'CANCELLED', canceledAt: new Date() } : i)),
    }));
    const preview = await previewCancelItems('20260914-0000001', ['i-coat', 'i-sock'], customer);
    expect(preview).toEqual({ kind: 'full', cash: 85_000 - 25_500, points: 3_500, shippingDeducted: 0 });
  });
});
