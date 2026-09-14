import { describe, it, expect, vi, beforeEach } from 'vitest';
import { won, type Actor, type PaymentGateway } from '@shop/core';

/**
 * 반품 회수 확인 · 환불 — 줄 단위.
 *
 * 금액 규칙은 core 가 본다. 여기서 보는 것은 **반품이라서 다른 것**이다: 승인한 신청에만,
 * 배송비는 단순 변심일 때만, 재고가 돌아오고, 확정 뒤면 적립을 그 줄 몫만 되가져오고, 주문은
 * 남은 줄의 자리로 돌아간다. 전부 돌려받으면 기존 환불을 탄다.
 */

const recordServerEvent = vi.hoisted(() => vi.fn<(...a: any[]) => any>(() => Promise.resolve()));
vi.mock('~/lib/analytics/server', () => ({ recordServerEvent }));

const refundOrder = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/admin/refund-order', () => ({ refundOrder }));

const reclaimPurchaseReward = vi.hoisted(() => vi.fn<(...a: any[]) => any>(async () => ({ reclaimed: 0, shortfall: 0 })));
vi.mock('~/lib/orders/reclaim-reward', () => ({ reclaimPurchaseReward }));

vi.mock('~/lib/shipping-policy', () => ({ getShippingPolicy: vi.fn() }));
vi.mock('~/lib/payments', () => ({ getPaymentGateway: vi.fn() }));

const tx = vi.hoisted(() => ({
  $queryRaw: vi.fn<(...a: any[]) => any>(),
  order: { findFirst: vi.fn<(...a: any[]) => any>(), update: vi.fn<(...a: any[]) => any>(), updateMany: vi.fn<(...a: any[]) => any>() },
  orderItem: { updateMany: vi.fn<(...a: any[]) => any>() },
  productVariant: { updateMany: vi.fn<(...a: any[]) => any>() },
  user: { update: vi.fn<(...a: any[]) => any>() },
  pointTransaction: { create: vi.fn<(...a: any[]) => any>(), findFirst: vi.fn<(...a: any[]) => any>() },
  payment: { update: vi.fn<(...a: any[]) => any>() },
  orderRefund: { create: vi.fn<(...a: any[]) => any>(), aggregate: vi.fn<(...a: any[]) => any>() },
  orderStatusLog: { create: vi.fn<(...a: any[]) => any>() },
  returnRequest: { update: vi.fn<(...a: any[]) => any>() },
}));
const db = vi.hoisted(() => ({
  order: { findFirst: vi.fn<(...a: any[]) => any>() },
  orderRefund: { aggregate: vi.fn<(...a: any[]) => any>() },
  pointTransaction: { findFirst: vi.fn<(...a: any[]) => any>() },
  returnRequest: { update: vi.fn<(...a: any[]) => any>() },
  $transaction: vi.fn<(...a: any[]) => any>(),
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const { completeReturn, previewCompleteReturn } = await import('~/lib/orders/complete-return');

const admin: Actor = { id: 'u-admin', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };

const NO_REFUNDS = { _sum: { amount: null, points: null, shippingDeducted: null }, _count: { _all: 0 } };

/** 코트 60,000 · 니트 30,000(반품 신청), 쿠폰 9,000, 포인트 0, 무료배송, 배송완료 */
const order = (over: Record<string, unknown> = {}) => ({
  id: 'o-1', orderNo: '20260914-0000002', status: 'RETURN_REQUESTED', userId: 'u-1', browserSessionId: null,
  couponDiscount: 9_000, pointsUsed: 0, rewardPoints: 810, shippingFee: 0, isRemoteArea: false,
  payable: 81_000, confirmedAt: null, deliveredAt: new Date('2026-09-10'),
  shippingPolicy: { baseFee: 3000, freeThreshold: 70_000, remoteSurcharge: 3000 },
  items: [
    { id: 'i-coat', variantId: 'v-coat', quantity: 1, subtotal: 60_000, status: 'DELIVERED',
      couponShare: 6_000, pointsShare: 0, rewardShare: 540, canceledAt: null },
    { id: 'i-knit', variantId: 'v-knit', quantity: 1, subtotal: 30_000, status: 'RETURN_REQUESTED',
      couponShare: 3_000, pointsShare: 0, rewardShare: 270, canceledAt: null },
  ],
  payment: { id: 'p-1', status: 'DONE', pgPaymentKey: 'pk_1', refundedAmount: 0 },
  returnRequests: [{ id: 'rr-1', status: 'APPROVED', reason: 'CHANGED_MIND', itemIds: ['i-knit'] }],
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

const useOrder = (o: ReturnType<typeof order>) => {
  db.order.findFirst.mockResolvedValue(o);
  tx.order.findFirst.mockResolvedValue(o);
};

beforeEach(() => {
  vi.clearAllMocks();
  useOrder(order());
  db.orderRefund.aggregate.mockResolvedValue(NO_REFUNDS);
  tx.orderRefund.aggregate.mockResolvedValue(NO_REFUNDS);
  db.pointTransaction.findFirst.mockResolvedValue(null);
  tx.pointTransaction.findFirst.mockResolvedValue(null);
  tx.orderItem.updateMany.mockImplementation(async (a: { where: { id: { in: string[] } } }) => ({ count: a.where.id.in.length }));
  tx.order.updateMany.mockResolvedValue({ count: 1 });
  db.$transaction.mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx));
});

describe('한 줄만 돌려받기', () => {
  it('그 줄 몫을 돌려주고, 단순 변심이면 기준 아래로 떨어진 배송비를 뗀다', async () => {
    const pg = gateway();
    const result = await completeReturn('20260914-0000002', admin, pg);
    // 30,000 − 쿠폰 3,000 − 배송비 3,000(남는 60,000 < 70,000)
    expect(vi.mocked(pg.cancel).mock.calls[0]![0].amount).toBe(24_000);
    expect(result).toMatchObject({ kind: 'partial', refunded: 24_000, shippingDeducted: 3_000 });
  });

  it('판매자 귀책이면 배송비를 떼지 않는다', async () => {
    useOrder(order({ returnRequests: [{ id: 'rr-1', status: 'APPROVED', reason: 'DEFECT', itemIds: ['i-knit'] }] }));
    const pg = gateway();
    await completeReturn('20260914-0000002', admin, pg);
    expect(vi.mocked(pg.cancel).mock.calls[0]![0].amount).toBe(27_000);
  });

  it('그 줄을 환불로 적고 재고를 돌리고, 신청을 끝낸다', async () => {
    await completeReturn('20260914-0000002', admin, gateway());
    expect(tx.orderItem.updateMany.mock.calls[0]![0]).toMatchObject({
      where: { id: { in: ['i-knit'] }, canceledAt: null, status: 'RETURN_REQUESTED' },
      data: { status: 'REFUNDED', refundedAfterConfirm: false },
    });
    expect(tx.productVariant.updateMany).toHaveBeenCalledWith({ where: { id: 'v-knit' }, data: { stock: { increment: 1 } } });
    expect(tx.productVariant.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.returnRequest.update.mock.calls[0]![0].data.status).toBe('COMPLETED');
    expect(tx.orderRefund.create.mock.calls[0]![0].data).toMatchObject({ kind: 'RETURN', amount: 24_000, itemIds: ['i-knit'] });
  });

  it('주문은 남은 줄의 자리(배송완료)로 돌아간다', async () => {
    const result = await completeReturn('20260914-0000002', admin, gateway());
    expect(tx.order.updateMany.mock.calls[0]![0]).toMatchObject({
      where: { status: 'RETURN_REQUESTED' }, data: { status: 'DELIVERED' },
    });
    expect(result.orderStatus).toBe('DELIVERED');
  });

  it('확정 전이면 앞으로 줄 적립만 줄이고, 확정 뒤면 준 적립에서 그 줄 몫만 되가져온다', async () => {
    await completeReturn('20260914-0000002', admin, gateway());
    expect(tx.order.update).toHaveBeenCalledWith({ where: { id: 'o-1' }, data: { rewardPoints: { decrement: 270 } } });
    expect(reclaimPurchaseReward).not.toHaveBeenCalled();

    vi.clearAllMocks();
    tx.orderItem.updateMany.mockImplementation(async (a: { where: { id: { in: string[] } } }) => ({ count: a.where.id.in.length }));
    tx.order.updateMany.mockResolvedValue({ count: 1 });
    tx.orderRefund.aggregate.mockResolvedValue(NO_REFUNDS);
    db.$transaction.mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx));
    useOrder(order({ confirmedAt: new Date('2026-09-12') }));

    await completeReturn('20260914-0000002', admin, gateway());
    expect(reclaimPurchaseReward).toHaveBeenCalledWith(tx, expect.objectContaining({ id: 'o-1' }), 270);
    expect(tx.order.update).not.toHaveBeenCalled();
    // 정산이 돌아간 달에 뺀다
    expect(tx.orderItem.updateMany.mock.calls[0]![0].data.refundedAfterConfirm).toBe(true);
  });
});

describe('전부 돌려받기', () => {
  it('주문째 반품완료로 옮기고 기존 환불을 탄다', async () => {
    useOrder(order({ returnRequests: [{ id: 'rr-1', status: 'APPROVED', reason: 'DEFECT', itemIds: ['i-coat', 'i-knit'] }] }));
    refundOrder.mockResolvedValue({ orderStatus: 'REFUNDED', refunded: 81_000, pointsReturned: 0 });
    const pg = gateway();

    const result = await completeReturn('20260914-0000002', admin, pg);

    expect(tx.order.updateMany.mock.calls[0]![0].data.status).toBe('RETURNED');
    expect(refundOrder).toHaveBeenCalledWith('20260914-0000002', admin, expect.any(String), pg);
    expect(db.returnRequest.update.mock.calls[0]![0].data.status).toBe('COMPLETED');
    expect(result).toMatchObject({ kind: 'full', refunded: 81_000 });
    expect(pg.cancel, '부분 취소를 따로 부르면 돈이 두 번 나간다').not.toHaveBeenCalled();
  });

  it('옛 신청(줄 없음)은 반품접수인 줄 전부다', async () => {
    useOrder(order({
      items: order().items.map((i) => ({ ...i, status: 'RETURN_REQUESTED' })),
      returnRequests: [{ id: 'rr-1', status: 'APPROVED', reason: 'DEFECT', itemIds: [] }],
    }));
    refundOrder.mockResolvedValue({ orderStatus: 'REFUNDED', refunded: 81_000, pointsReturned: 0 });
    const result = await completeReturn('20260914-0000002', admin, gateway());
    expect(result.kind).toBe('full');
  });
});

describe('막는 것', () => {
  it('승인하지 않은 신청은 돌려주지 않는다 — 물건이 오기 전에 돈이 나가면 안 된다', async () => {
    useOrder(order({ returnRequests: [{ id: 'rr-1', status: 'REQUESTED', reason: 'DEFECT', itemIds: ['i-knit'] }] }));
    await expect(completeReturn('20260914-0000002', admin, gateway())).rejects.toMatchObject({ code: 'NOT_APPROVED' });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('이미 끝난 신청은 다시 돌려주지 않는다', async () => {
    useOrder(order({ returnRequests: [{ id: 'rr-1', status: 'COMPLETED', reason: 'DEFECT', itemIds: ['i-knit'] }] }));
    await expect(completeReturn('20260914-0000002', admin, gateway())).rejects.toMatchObject({ code: 'NOT_APPROVED' });
  });

  it('가맹점은 돈을 돌려줄 수 없다', async () => {
    await expect(completeReturn('20260914-0000002', merchant, gateway())).rejects.toMatchObject({ status: 403 });
  });

  it('주문을 잠그고 잠근 뒤에 다시 읽는다', async () => {
    await completeReturn('20260914-0000002', admin, gateway());
    const sql = (tx.$queryRaw.mock.calls[0]![0] as TemplateStringsArray).join('?');
    expect(sql).toContain('FOR UPDATE');
    expect(tx.order.findFirst).toHaveBeenCalled();
  });
});

describe('미리보기', () => {
  it('운영 화면에 돌려줄 금액을 주고 아무것도 바꾸지 않는다', async () => {
    expect(await previewCompleteReturn('20260914-0000002', admin))
      .toEqual({ kind: 'partial', cash: 24_000, points: 0, shippingDeducted: 3_000 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
