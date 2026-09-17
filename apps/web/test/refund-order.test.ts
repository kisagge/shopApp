import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

const reclaimPurchaseReward = vi.hoisted(() =>
  vi.fn<(...a: any[]) => any>(() => Promise.resolve({ reclaimed: 0, shortfall: 0 })),
);
const reclaimReviewReward = vi.hoisted(() =>
  vi.fn<(...a: any[]) => any>(() => Promise.resolve({ reclaimed: 0, shortfall: 0 })),
);
vi.mock('~/lib/orders/reclaim-reward', () => ({ reclaimPurchaseReward, reclaimReviewReward }));

/** 잠근 뒤 다시 읽는 것도 같은 값을 보게 한다 — 달리 보이게 할 때만 순서대로 돌려준다 */
const read = vi.hoisted(() => ({
  findOrder: vi.fn<(...a: any[]) => any>(),
  aggregate: vi.fn<(...a: any[]) => any>(),
  legacy: vi.fn<(...a: any[]) => any>(),
}));
const tx = vi.hoisted(() => ({
  $queryRaw: vi.fn<(...a: any[]) => any>(),
  order: { findFirst: read.findOrder, updateMany: vi.fn<(...a: any[]) => any>() },
  orderItem: { updateMany: vi.fn<(...a: any[]) => any>() },
  productVariant: { updateMany: vi.fn<(...a: any[]) => any>() },
  user: { update: vi.fn<(...a: any[]) => any>() },
  pointTransaction: { create: vi.fn<(...a: any[]) => any>(), findFirst: read.legacy },
  orderRefund: { create: vi.fn<(...a: any[]) => any>(), aggregate: read.aggregate },
  userCoupon: { update: vi.fn<(...a: any[]) => any>() },
  payment: { update: vi.fn<(...a: any[]) => any>() },
  orderStatusLog: { create: vi.fn<(...a: any[]) => any>() },
}));
const db = vi.hoisted(() => ({
  order: { findFirst: read.findOrder },
  pointTransaction: { findFirst: read.legacy },
  orderRefund: { aggregate: read.aggregate },
  $transaction: vi.fn<(...a: any[]) => any>(),
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const recordServerEvent = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/analytics/server', () => ({ recordServerEvent }));

const { refundOrder } = await import('~/lib/admin/refund-order');

const admin: Actor = { id: 'u-admin', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };
const customer: Actor = { id: 'u-c', role: 'CUSTOMER', merchantId: null };

const cancel = vi.fn<(...a: any[]) => any>();
const gateway = {
  provider: 'test',
  cancel,
  confirm: vi.fn<(...a: any[]) => any>(),
  inquire: vi.fn<(...a: any[]) => any>(),
} as never;

const order = (over: Record<string, unknown> = {}) => ({
  id: 'o-1', orderNo: '20260904-1234567', status: 'RETURNED',
  userId: 'u-c', browserSessionId: 's-1',
  pointsUsed: 3_000, payable: 68_000, usedCouponId: 'uc-1', canceledAt: null,
  items: [
    { id: 'i-1', variantId: 'v-1', quantity: 2 },
    { id: 'i-2', variantId: 'v-2', quantity: 1 },
  ],
  payment: { id: 'p-1', status: 'DONE', pgPaymentKey: 'pk-1', refundedAmount: 0 },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.order.findFirst.mockResolvedValue(order());
  db.pointTransaction.findFirst.mockResolvedValue(null);
  db.orderRefund.aggregate.mockResolvedValue({
    _sum: { amount: null, points: null, shippingDeducted: null }, _count: { _all: 0 },
  });
  db.$transaction.mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx));
  tx.order.updateMany.mockResolvedValue({ count: 1 });
  cancel.mockResolvedValue({ status: 'CANCELED' });
});

describe('권한', () => {
  it('고객은 환불할 수 없다', async () => {
    await expect(refundOrder('20260904-1234567', customer, '사유', gateway))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(cancel).not.toHaveBeenCalled();
  });

  it('가맹점도 환불할 수 없다 — 돈이 나가는 동작이다', async () => {
    await expect(refundOrder('20260904-1234567', merchant, '사유', gateway))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('돈이 실제로 나간다', () => {
  it('PG 취소를 부른다', async () => {
    await refundOrder('20260904-1234567', admin, '반품 승인', gateway);

    expect(cancel).toHaveBeenCalledWith(expect.objectContaining({
      paymentKey: 'pk-1',
      amount: null,
      reason: '반품 승인',
    }));
  });

  it('멱등키를 주문번호로 고정한다 — 재시도로 두 번 나가면 안 된다', async () => {
    await refundOrder('20260904-1234567', admin, '사유', gateway);

    expect(cancel.mock.calls[0]?.[0].idempotencyKey).toBe('refund-20260904-1234567');
  });

  it('PG 가 실패하면 아무것도 바꾸지 않는다', async () => {
    cancel.mockRejectedValue(new Error('PG 오류'));

    await expect(refundOrder('20260904-1234567', admin, '사유', gateway)).rejects.toThrow();
    // 결제 취소는 잠금 안에서 부른다 — 실패하면 쓰기 전에 트랜잭션째 끝난다
    expect(tx.order.updateMany).not.toHaveBeenCalled();
    expect(tx.productVariant.updateMany).not.toHaveBeenCalled();
    expect(tx.orderRefund.create).not.toHaveBeenCalled();
  });

  it('결제가 잡힌 적 없으면 거절한다 — 상태만 바꾸면 거짓말이 된다', async () => {
    db.order.findFirst.mockResolvedValue(order({
      status: 'CANCELLED',
      payment: { id: 'p-1', status: 'ABORTED', pgPaymentKey: null, refundedAmount: 0 },
    }));

    await expect(refundOrder('20260904-1234567', admin, '사유', gateway))
      .rejects.toMatchObject({ code: 'NOTHING_TO_REFUND' });
    expect(cancel).not.toHaveBeenCalled();
  });
});

describe('되돌리는 것들', () => {
  it('반품에서 오면 재고를 되돌린다', async () => {
    const result = await refundOrder('20260904-1234567', admin, '사유', gateway);

    expect(tx.productVariant.updateMany).toHaveBeenCalledTimes(2);
    expect(result.stockRestored).toBe(3);
  });

  it('취소에서 오면 재고를 건드리지 않는다 — 이미 풀려 있다', async () => {
    db.order.findFirst.mockResolvedValue(order({ status: 'CANCELLED' }));

    const result = await refundOrder('20260904-1234567', admin, '사유', gateway);

    expect(tx.productVariant.updateMany).not.toHaveBeenCalled();
    expect(result.stockRestored).toBe(0);
  });

  it('쓴 포인트를 원장과 함께 돌려준다', async () => {
    const result = await refundOrder('20260904-1234567', admin, '사유', gateway);

    expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { pointBalance: { increment: 3_000 } },
    }));
    expect(tx.pointTransaction.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ amount: 3_000, reason: 'CANCEL_REFUND' }),
    }));
    expect(result.pointsReturned).toBe(3_000);
  });

  it('이미 돌려준 포인트를 또 주지 않는다', async () => {
    // 잔액만 두 번 올라가면 아무도 알아채지 못한다. 원장을 보고 판단한다.
    db.pointTransaction.findFirst.mockResolvedValue({ id: 'pt-1' });

    const result = await refundOrder('20260904-1234567', admin, '사유', gateway);

    expect(tx.user.update).not.toHaveBeenCalled();
    expect(result.pointsReturned).toBe(0);
  });

  it('쿠폰을 되살린다', async () => {
    await refundOrder('20260904-1234567', admin, '사유', gateway);

    expect(tx.userCoupon.update).toHaveBeenCalledWith({
      where: { id: 'uc-1' }, data: { usedAt: null },
    });
  });

  it('결제 원장에 환불액을 더한다', async () => {
    db.order.findFirst.mockResolvedValue(order({
      payment: { id: 'p-1', status: 'DONE', pgPaymentKey: 'pk-1', refundedAmount: 1_000 },
    }));

    await refundOrder('20260904-1234567', admin, '사유', gateway);

    expect(tx.payment.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'CANCELED', refundedAmount: 69_000 }),
    }));
  });
});

describe('중복과 순서', () => {
  it('이미 환불된 주문은 거절한다', async () => {
    db.order.findFirst.mockResolvedValue(order({ status: 'REFUNDED' }));

    await expect(refundOrder('20260904-1234567', admin, '사유', gateway))
      .rejects.toMatchObject({ code: 'ALREADY_REFUNDED' });
    expect(cancel).not.toHaveBeenCalled();
  });

  it('배송중인 주문은 환불할 수 없다 — 상태머신이 막는다', async () => {
    db.order.findFirst.mockResolvedValue(order({ status: 'SHIPPED' }));

    await expect(refundOrder('20260904-1234567', admin, '사유', gateway)).rejects.toThrow();
    expect(cancel).not.toHaveBeenCalled();
  });

  it('같은 순간 다른 요청이 먼저 끝냈으면 멈춘다', async () => {
    tx.order.updateMany.mockResolvedValue({ count: 0 });

    await expect(refundOrder('20260904-1234567', admin, '사유', gateway))
      .rejects.toMatchObject({ code: 'ALREADY_PROCESSED' });
  });

  it('없는 주문은 404 다', async () => {
    db.order.findFirst.mockResolvedValue(null);

    await expect(refundOrder('없음', admin, '사유', gateway))
      .rejects.toMatchObject({ code: 'ORDER_NOT_FOUND', status: 404 });
  });
});

describe('기록', () => {
  it('매출 이벤트를 남긴다', async () => {
    await refundOrder('20260904-1234567', admin, '사유', gateway);

    expect(recordServerEvent).toHaveBeenCalledWith(expect.objectContaining({
      name: 'refund', value: 68_000, quantity: 3, orderId: '20260904-1234567',
    }));
  });

  it('상태 로그에 누가 왜 했는지 남긴다', async () => {
    await refundOrder('20260904-1234567', admin, '파손 반품', gateway);

    expect(tx.orderStatusLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        from: 'RETURNED', to: 'REFUNDED', actor: 'u-admin', note: '파손 반품',
      }),
    });
  });
});

/**
 * 정산은 **주문의 `canceledAt` 이 그 기간 안에 있는가**로 환불을 차감한다
 * (`close-settlement.ts`). 환불하면서 그 시각을 남기지 않으면, 반품된 물건
 * 값이 가맹점에게 그대로 지급된다 — 돈이 한쪽으로만 흐른다.
 */
describe('환불 시각', () => {
  it('반품 환불은 주문에 환불 시각을 남긴다 — 정산이 이것으로 차감한다', async () => {
    await refundOrder('20260904-1234567', admin, '반품 완료', gateway);

    const [args] = tx.order.updateMany.mock.calls.at(-1) as [{ data: Record<string, unknown> }];
    expect(args.data['status']).toBe('REFUNDED');
    expect(args.data['canceledAt'], '환불 시각이 없으면 정산이 차감하지 못한다').toBeInstanceOf(Date);
  });

  /** 취소는 그때 이미 돈을 멈췄다. 환불 시각으로 덮으면 다른 기간에서 또 빠진다. */
  it('취소 뒤 환불은 취소 시각을 덮어쓰지 않는다', async () => {
    const canceledAt = new Date('2026-08-30T01:00:00Z');
    db.order.findFirst.mockResolvedValue(order({ status: 'CANCELLED', canceledAt }));

    await refundOrder('20260904-1234567', admin, '취소 환불', gateway);

    const [args] = tx.order.updateMany.mock.calls.at(-1) as [{ data: Record<string, unknown> }];
    expect(args.data).not.toHaveProperty('canceledAt');
  });
});

/**
 * 확정 뒤에도 하자 반품을 받게 되면서, 확정으로 준 적립을 되가져와야 한다.
 * 물건도 돌아오고 돈도 돌아가는데 적립만 남으면 되풀이하는 만큼 쌓인다.
 */
describe('구매확정 적립', () => {
  it('환불하면 회수를 부른다', async () => {
    await refundOrder('20260904-1234567', admin, '하자 반품', gateway);

    expect(reclaimPurchaseReward).toHaveBeenCalledWith(tx, expect.objectContaining({ id: 'o-1' }));
  });

  it('회수한 금액을 결과에 실어 준다 — 운영자가 무엇이 일어났는지 봐야 한다', async () => {
    reclaimPurchaseReward.mockResolvedValueOnce({ reclaimed: 2_890, shortfall: 0 });

    const out = await refundOrder('20260904-1234567', admin, '하자 반품', gateway);

    expect(out.rewardReclaimed).toBe(2_890);
  });

  it('돌려받은 줄의 후기 적립도 되가져오고 결과에 따로 싣는다', async () => {
    reclaimReviewReward.mockResolvedValueOnce({ reclaimed: 500, shortfall: 0 });

    const out = await refundOrder('20260904-1234567', admin, '하자 반품', gateway);

    expect(reclaimReviewReward).toHaveBeenCalledWith(tx, expect.objectContaining({ orderNo: '20260904-1234567' }), ['i-1', 'i-2']);
    expect(out.reviewRewardReclaimed).toBe(500);
  });

  it('확정에 이른 적 없는 주문이면 0 이다', async () => {
    const out = await refundOrder('20260904-1234567', admin, '취소 환불', gateway);

    expect(out.rewardReclaimed).toBe(0);
  });
});

describe('일부 취소한 뒤의 환불', () => {
  it('포인트 원장에 일부 돌려준 흔적이 있어도 남은 포인트를 돌려준다', async () => {
    /*
     * 예전에는 원장에 CANCEL_REFUND 가 하나라도 있으면 건너뛰었다. 일부 취소가 그 흔적을 남기면
     * **남은 포인트를 영영 안 돌려준다.** 이제 환불 기록의 합으로 센다.
     */
    db.pointTransaction.findFirst.mockResolvedValue({ id: 'pt-partial' });
    db.orderRefund.aggregate.mockResolvedValue({
      _sum: { amount: 10_000, points: 1_000, shippingDeducted: 0 }, _count: { _all: 1 },
    });
    const result = await refundOrder('20260904-1234567', admin, '반품', gateway);
    expect(result.pointsReturned).toBe(order().pointsUsed - 1_000);
    expect(result.refunded).toBe(order().payable - 10_000);
  });
});

/**
 * **그사이 끝난 일부 반품.** 일부 반품·일부 취소는 주문 상태를 바꾸지 않는다. 잠그기 전에 읽은 줄로
 * 계산하면 그 줄의 재고와 포인트가 한 번 더 돌아간다 — 잠근 뒤 다시 읽은 값으로 계산하는지 본다.
 */
describe('잠근 뒤 다시 읽는다', () => {
  beforeEach(() => {
    read.findOrder.mockReset();
    read.findOrder
      .mockResolvedValueOnce(order())
      .mockResolvedValueOnce(order({
        items: [
          { id: 'i-1', variantId: 'v-1', quantity: 2, canceledAt: null },
          { id: 'i-2', variantId: 'v-2', quantity: 1, canceledAt: new Date('2026-09-17') },
        ],
        payment: { id: 'p-1', status: 'PARTIAL_CANCELED', pgPaymentKey: 'pk-1', refundedAmount: 20_000 },
      }));
    read.aggregate.mockResolvedValue({
      _sum: { amount: 20_000, points: 1_000, shippingDeducted: 0 }, _count: { _all: 1 },
    });
  });

  it('주문을 잠근 다음에 남은 줄과 돌려준 몫을 읽는다', async () => {
    await refundOrder('20260904-1234567', admin, '반품', gateway);
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.$queryRaw.mock.invocationCallOrder[0]!).toBeLessThan(read.findOrder.mock.invocationCallOrder[1]!);
    expect(tx.$queryRaw.mock.invocationCallOrder[0]!).toBeLessThan(read.aggregate.mock.invocationCallOrder[0]!);
  });

  it('그사이 돌려받은 줄의 재고와 포인트를 다시 돌려주지 않는다', async () => {
    const result = await refundOrder('20260904-1234567', admin, '반품', gateway);
    expect(result).toMatchObject({ refunded: 48_000, pointsReturned: 2_000, stockRestored: 2 });
    expect(tx.productVariant.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.payment.update.mock.calls[0]![0].data.refundedAmount).toBe(68_000);
  });

  it('잠근 뒤 보니 이미 환불됐으면 PG 를 부르지 않는다', async () => {
    read.findOrder.mockReset();
    read.findOrder
      .mockResolvedValueOnce(order())
      .mockResolvedValueOnce(order({ status: 'REFUNDED' }));
    await expect(refundOrder('20260904-1234567', admin, '반품', gateway))
      .rejects.toMatchObject({ code: 'ALREADY_REFUNDED' });
    expect(cancel).not.toHaveBeenCalled();
  });

  it('돈이 나간 뒤 장부에 못 적으면 크게 남기고 오류를 그대로 올린다', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    tx.orderStatusLog.create.mockRejectedValueOnce(new Error('connection lost'));
    await expect(refundOrder('20260904-1234567', admin, '반품', gateway)).rejects.toThrow('connection lost');
    expect(error).toHaveBeenCalledWith(expect.stringContaining('수동 대사'), { orderNo: '20260904-1234567' }, expect.any(Error));
    error.mockRestore();
  });
});
