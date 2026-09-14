import { describe, it, expect, vi, beforeEach } from 'vitest';
import { won, type Actor, type PaymentGateway } from '@shop/core';

const recordServerEvent = vi.hoisted(() => vi.fn<(...a: any[]) => any>(() => Promise.resolve()));
vi.mock('~/lib/analytics/server', () => ({ recordServerEvent }));

const tx = vi.hoisted(() => ({
  order: { updateMany: vi.fn<(...a: any[]) => any>(), update: vi.fn<(...a: any[]) => any>() },
  orderItem: { updateMany: vi.fn<(...a: any[]) => any>() },
  productVariant: { updateMany: vi.fn<(...a: any[]) => any>() },
  user: { update: vi.fn<(...a: any[]) => any>() },
  pointTransaction: { create: vi.fn<(...a: any[]) => any>() },
  orderRefund: { create: vi.fn<(...a: any[]) => any>() },
  userCoupon: { update: vi.fn<(...a: any[]) => any>() },
  payment: { update: vi.fn<(...a: any[]) => any>() },
  orderStatusLog: { create: vi.fn<(...a: any[]) => any>() },
}));
const db = vi.hoisted(() => ({
  order: { findFirst: vi.fn<(...a: any[]) => any>() },
  // 앞서 돌려준 것 — 기본은 없다(부분 취소가 없던 주문)
  orderRefund: { aggregate: vi.fn<(...a: any[]) => any>() },
  pointTransaction: { findFirst: vi.fn<(...a: any[]) => any>() },
  $transaction: vi.fn<(...a: any[]) => any>(),
}));
vi.mock('@shop/db', () => ({ prisma: db }));

/** 게이트웨이를 언제 만드는지 보려고 가로챈다 */
const payments = vi.hoisted(() => ({ getPaymentGateway: vi.fn<(...a: any[]) => any>() }));
vi.mock('~/lib/payments', () => payments);

const { cancelOrder, CancelError } = await import('~/lib/orders/cancel-order');

const customer: Actor = { id: 'u-1', role: 'CUSTOMER', merchantId: null };
const admin: Actor = { id: 'u-admin', role: 'ADMIN', merchantId: null };

const order = (over: Record<string, unknown> = {}) => ({
  id: 'o-1', orderNo: '20260831-1234567', status: 'PAID', userId: 'u-1',
  pointsUsed: 3_000, payable: 286_000, usedCouponId: 'uc-1',
  items: [
    { variantId: 'v-coat-m', quantity: 2 },
    { variantId: 'v-knit-l', quantity: 1 },
  ],
  payment: { id: 'p-1', status: 'DONE', pgPaymentKey: 'pk_1', refundedAmount: 0 },
  ...over,
});

const gateway = (): PaymentGateway => ({
  provider: 'mock',
  inquire: vi.fn<(...a: any[]) => any>(),
  confirm: vi.fn<(...a: any[]) => any>(),
  cancel: vi.fn<(...a: any[]) => any>(async () => ({
    paymentKey: 'pk_1', approvalNo: null, method: 'CARD' as const, status: 'CANCELED' as const,
    amount: won(0), approvedAt: null, virtualAccount: null, raw: {},
  })),
});

beforeEach(() => {
  vi.clearAllMocks();
  db.order.findFirst.mockResolvedValue(order());
  db.orderRefund.aggregate.mockResolvedValue({
    _sum: { amount: null, points: null, shippingDeducted: null }, _count: { _all: 0 },
  });
  db.pointTransaction.findFirst.mockResolvedValue(null);
  db.$transaction.mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx));
  tx.order.updateMany.mockResolvedValue({ count: 1 });
});

describe('주문 생성이 한 일을 역순으로 푼다', () => {
  it('재고를 되돌린다 — 안 풀면 팔 수 있는 물건이 영영 묶인다', async () => {
    await cancelOrder('20260831-1234567', customer, '단순 변심', gateway());
    expect(tx.productVariant.updateMany).toHaveBeenCalledWith({
      where: { id: 'v-coat-m' }, data: { stock: { increment: 2 } },
    });
    expect(tx.productVariant.updateMany).toHaveBeenCalledWith({
      where: { id: 'v-knit-l' }, data: { stock: { increment: 1 } },
    });
  });

  it('포인트를 돌려주고 원장에도 남긴다', async () => {
    await cancelOrder('20260831-1234567', customer, '단순 변심', gateway());
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'u-1' }, data: { pointBalance: { increment: 3_000 } },
    });
    expect(tx.pointTransaction.create.mock.calls[0]![0].data).toMatchObject({
      amount: 3_000, reason: 'CANCEL_REFUND',
    });
  });

  it('쿠폰을 되살린다 — 취소했는데 쿠폰이 소멸되면 고객이 손해다', async () => {
    await cancelOrder('20260831-1234567', customer, '단순 변심', gateway());
    expect(tx.userCoupon.update).toHaveBeenCalledWith({
      where: { id: 'uc-1' }, data: { usedAt: null },
    });
  });

  it('포인트·쿠폰을 안 썼으면 건드리지 않는다', async () => {
    db.order.findFirst.mockResolvedValue(order({ pointsUsed: 0, usedCouponId: null }));
    await cancelOrder('20260831-1234567', customer, '단순 변심', gateway());
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.userCoupon.update).not.toHaveBeenCalled();
  });
});

describe('환불', () => {
  it('실제로 결제된 건만 PG 취소를 부른다', async () => {
    const gw = gateway();
    await cancelOrder('20260831-1234567', customer, '단순 변심', gw);
    expect(gw.cancel).toHaveBeenCalledWith(
      expect.objectContaining({ paymentKey: 'pk_1', amount: null, reason: '단순 변심' }),
    );
  });

  it('멱등키를 붙인다 — 재시도로 두 번 환불되는 사고를 막는 유일한 장치다', async () => {
    const gw = gateway();
    await cancelOrder('20260831-1234567', customer, '단순 변심', gw);
    expect((gw.cancel as ReturnType<typeof vi.fn>).mock.calls[0]![0].idempotencyKey)
      .toBe('cancel-20260831-1234567');
  });

  it('입금 전(READY)이면 PG 를 부르지 않는다 — 나간 돈이 없다', async () => {
    db.order.findFirst.mockResolvedValue(
      order({ status: 'PENDING', payment: { id: 'p-1', status: 'READY', pgPaymentKey: null, refundedAmount: 0 } }),
    );
    const gw = gateway();
    const r = await cancelOrder('20260831-1234567', customer, '단순 변심', gw);
    expect(gw.cancel).not.toHaveBeenCalled();
    expect(r.refunded).toBe(0);
    expect(r.status).toBe('CANCELLED');
  });

  it('환불이 일어나면 REFUNDED 까지 옮기고 refund 이벤트를 남긴다', async () => {
    const r = await cancelOrder('20260831-1234567', customer, '단순 변심', gateway());
    expect(r.status).toBe('REFUNDED');
    expect(r.refunded).toBe(286_000);
    expect(recordServerEvent.mock.calls[0]![0]).toMatchObject({
      name: 'refund', orderId: '20260831-1234567', value: 286_000,
    });
  });

  it('나간 돈이 없으면 refund 이벤트도 없다', async () => {
    db.order.findFirst.mockResolvedValue(
      order({ status: 'PENDING', payment: { id: 'p-1', status: 'READY', pgPaymentKey: null, refundedAmount: 0 } }),
    );
    await cancelOrder('20260831-1234567', customer, '단순 변심', gateway());
    expect(recordServerEvent).not.toHaveBeenCalled();
  });
});

describe('누가 취소할 수 있는가', () => {
  it('고객은 출고 전까지만 스스로 취소한다', async () => {
    db.order.findFirst.mockResolvedValue(order({ status: 'SHIPPED' }));
    await expect(
      cancelOrder('20260831-1234567', customer, '단순 변심', gateway()),
    ).rejects.toMatchObject({ code: 'NOT_CANCELLABLE' });
  });

  it('고객은 자기 주문만 조회한다', async () => {
    await cancelOrder('20260831-1234567', customer, '단순 변심', gateway());
    expect(db.order.findFirst.mock.calls[0]![0].where).toMatchObject({ userId: 'u-1' });
  });

  it('운영진은 소유자 조건 없이 조회한다', async () => {
    await cancelOrder('20260831-1234567', admin, '고객 요청', gateway());
    expect(db.order.findFirst.mock.calls[0]![0].where).not.toHaveProperty('userId');
  });

  it('그 사이 다른 요청이 먼저 취소했으면 거절한다', async () => {
    tx.order.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      cancelOrder('20260831-1234567', customer, '단순 변심', gateway()),
    ).rejects.toBeInstanceOf(CancelError);
  });

  it('주문이 없으면 404 로 표시한다', async () => {
    db.order.findFirst.mockResolvedValue(null);
    await expect(
      cancelOrder('x', customer, '단순 변심', gateway()),
    ).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND', status: 404 });
  });
});

describe('취소할 수 없는 이유를 구분해서 알린다', () => {
  it('이미 취소된 주문에 "출고됐다"고 말하지 않는다', async () => {
    db.order.findFirst.mockResolvedValue(order({ status: 'CANCELLED' }));
    await expect(
      cancelOrder('20260831-1234567', customer, '중복 요청', gateway()),
    ).rejects.toMatchObject({ code: 'ALREADY_CANCELLED' });
  });

  it('환불까지 끝난 주문도 마찬가지다', async () => {
    db.order.findFirst.mockResolvedValue(order({ status: 'REFUNDED' }));
    const p = cancelOrder('20260831-1234567', customer, '중복 요청', gateway());
    await expect(p).rejects.toMatchObject({ code: 'ALREADY_CANCELLED' });
    await expect(p).rejects.toThrow(/환불완료/);
  });

  it('구매확정된 주문은 운영진도 취소할 수 없다', async () => {
    db.order.findFirst.mockResolvedValue(order({ status: 'CONFIRMED' }));
    await expect(
      cancelOrder('20260831-1234567', admin, '고객 요청', gateway()),
    ).rejects.toMatchObject({ code: 'ALREADY_CONFIRMED' });
  });

  it('출고된 주문은 고객만 막히고 운영진은 취소할 수 있다', async () => {
    db.order.findFirst.mockResolvedValue(order({ status: 'SHIPPED' }));
    await expect(
      cancelOrder('20260831-1234567', customer, '변심', gateway()),
    ).rejects.toMatchObject({ code: 'NOT_CANCELLABLE' });

    db.order.findFirst.mockResolvedValue(order({ status: 'SHIPPED' }));
    await expect(
      cancelOrder('20260831-1234567', admin, '배송 사고', gateway()),
    ).rejects.toThrow(/배송중/); // 상태머신이 SHIPPED → CANCELLED 를 막는다
  });
});

describe('결제가 잡히지 않은 주문', () => {
  it('게이트웨이를 아예 만들지 않는다', async () => {
    /*
     * **기본 인자로 미리 만들면 부를 때마다 만들어진다.** 결제 키가 없는
     * 배포에서는 그 자리에서 던져서, 돈이 오간 적 없는 주문의 취소가 통째로
     * 500 이었다 — 결제 대기 재고를 푸는 배치도 같은 이유로 한 건도 못
     * 풀었을 것이다.
     *
     * 여기서 게이트웨이를 넘기지 않는다. 만들려 들면 그 자리에서 터진다.
     */
    db.order.findFirst.mockResolvedValue(
      order({ status: 'PENDING', payment: { id: 'pay-1', status: 'READY', pgPaymentKey: null, refundedAmount: 0 } }),
    );

    // 만들려 들면 그 자리에서 터진다 — 키가 없는 배포가 그랬다
    payments.getPaymentGateway.mockImplementation(() => {
      throw new Error('결제 설정이 없습니다');
    });

    const result = await cancelOrder('20260101-0000001', customer, '단순 변심');

    expect(result.refunded).toBe(0);
    expect(result.status).toBe('CANCELLED');
  });
});

describe('일부 취소한 뒤의 전액 취소', () => {
  /*
   * 한 줄을 먼저 취소한 주문을 나중에 전부 취소할 때, 주문에 적힌 결제액·포인트를 통째로
   * 돌려주면 그 줄 몫이 **두 번** 나간다. 이미 돌아온 재고도 다시 올리면 없는 물건이 생긴다.
   */
  beforeEach(() => {
    db.order.findFirst.mockResolvedValue(order({
      items: [
        { id: 'i-1', variantId: 'v-coat-m', quantity: 2, canceledAt: null },
        { id: 'i-2', variantId: 'v-knit-l', quantity: 1, canceledAt: new Date('2026-09-10') },
      ],
      payment: { id: 'p-1', status: 'PARTIAL_CANCELED', pgPaymentKey: 'pk_1', refundedAmount: 40_000 },
    }));
    db.orderRefund.aggregate.mockResolvedValue({
      _sum: { amount: 40_000, points: 1_000, shippingDeducted: 3_000 }, _count: { _all: 1 },
    });
  });

  it('남은 돈과 남은 포인트만 돌려준다', async () => {
    const result = await cancelOrder('20260831-1234567', customer, '변심', gateway());
    expect(result).toMatchObject({ refunded: 286_000 - 40_000, pointsReturned: 2_000 });
    expect(tx.payment.update.mock.calls[0]![0].data.refundedAmount).toBe(286_000);
  });

  it('이미 취소된 줄의 재고는 다시 올리지 않는다', async () => {
    await cancelOrder('20260831-1234567', customer, '변심', gateway());
    expect(tx.productVariant.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.productVariant.updateMany).toHaveBeenCalledWith({
      where: { id: 'v-coat-m' }, data: { stock: { increment: 2 } },
    });
  });

  it('환불 기록을 남기고, 앞서 뗀 배송비는 돌려준 것으로 적는다', async () => {
    await cancelOrder('20260831-1234567', customer, '변심', gateway());
    expect(tx.orderRefund.create.mock.calls[0]![0].data).toMatchObject({
      amount: 246_000, points: 2_000, shippingDeducted: -3_000, kind: 'CANCEL', itemIds: ['i-1'],
    });
  });
});
