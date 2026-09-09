import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

const reclaimPurchaseReward = vi.hoisted(() =>
  vi.fn<(...a: any[]) => any>(() => Promise.resolve({ reclaimed: 0, shortfall: 0 })),
);
vi.mock('~/lib/orders/reclaim-reward', () => ({ reclaimPurchaseReward }));

const tx = vi.hoisted(() => ({
  order: { updateMany: vi.fn<(...a: any[]) => any>() },
  orderItem: { updateMany: vi.fn<(...a: any[]) => any>() },
  productVariant: { updateMany: vi.fn<(...a: any[]) => any>() },
  user: { update: vi.fn<(...a: any[]) => any>() },
  pointTransaction: { create: vi.fn<(...a: any[]) => any>() },
  userCoupon: { update: vi.fn<(...a: any[]) => any>() },
  payment: { update: vi.fn<(...a: any[]) => any>() },
  orderStatusLog: { create: vi.fn<(...a: any[]) => any>() },
}));
const db = vi.hoisted(() => ({
  order: { findFirst: vi.fn<(...a: any[]) => any>() },
  pointTransaction: { findFirst: vi.fn<(...a: any[]) => any>() },
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
    expect(db.$transaction).not.toHaveBeenCalled();
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

  it('확정에 이른 적 없는 주문이면 0 이다', async () => {
    const out = await refundOrder('20260904-1234567', admin, '취소 환불', gateway);

    expect(out.rewardReclaimed).toBe(0);
  });
});
