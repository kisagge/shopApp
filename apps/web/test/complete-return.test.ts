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

const clearLowStockForVariants = vi.hoisted(() => vi.fn<(...a: any[]) => any>(() => Promise.resolve()));
vi.mock('~/lib/notifications/low-stock', () => ({ clearLowStockForVariants }));

const reclaimPurchaseReward = vi.hoisted(() => vi.fn<(...a: any[]) => any>(async () => ({ reclaimed: 0, shortfall: 0 })));
const reclaimReviewReward = vi.hoisted(() => vi.fn<(...a: any[]) => any>(async () => ({ reclaimed: 0, shortfall: 0 })));
vi.mock('~/lib/orders/reclaim-reward', () => ({ reclaimPurchaseReward, reclaimReviewReward }));

const reportLedgerMismatch = vi.hoisted(() => vi.fn<(...a: any[]) => any>(() => Promise.resolve()));
vi.mock('~/lib/errors/ledger', () => ({ reportLedgerMismatch }));

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
  returnRequest: { update: vi.fn<(...a: any[]) => any>(), updateMany: vi.fn<(...a: any[]) => any>() },
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
  /*
   * **쓰기 자리의 기본값을 여기서 되돌린다.** `clearAllMocks` 는 호출 기록만 지우고 구현은
   * 남긴다 — 한 검사가 "장부를 적지 못했다" 로 거절하게 만들어 두면 **그 뒤 검사들이
   * 그대로 물려받는다.** 실제로 그렇게 한 번 어긋났고, 검사 순서에 기대지 않으려고 적는다.
   */
  tx.orderRefund.create.mockResolvedValue({});
  db.$transaction.mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx));
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
    // 후기 적립은 확정과 상관없이 돌려받은 줄 몫을 가져온다
    expect(reclaimReviewReward).toHaveBeenCalledWith(tx, expect.objectContaining({ id: 'o-1' }), expect.any(Array));
    expect(reclaimReviewReward.mock.calls[0]![2]).toHaveLength(1);

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
    expect(db.returnRequest.updateMany.mock.calls[0]![0].data.status).toBe('COMPLETED');
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

  it('교환 신청은 환불하지 않는다 — 예전에는 종류를 안 봐서 교환을 승인하고 누르면 돈이 나갔다', async () => {
    const gw = gateway();
    useOrder(order({ returnRequests: [{ id: 'rr-1', type: 'EXCHANGE', status: 'APPROVED', reason: 'CHANGED_MIND', itemIds: ['i-knit'] }] }));
    await expect(completeReturn('20260914-0000002', admin, gw)).rejects.toMatchObject({ code: 'EXCHANGE_NOT_REFUNDABLE' });
    await expect(previewCompleteReturn('20260914-0000002', admin)).rejects.toMatchObject({ code: 'EXCHANGE_NOT_REFUNDABLE' });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(refundOrder).not.toHaveBeenCalled();
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

/**
 * **세 걸음이 각자 다른 트랜잭션이라 중간에 끊긴다.**
 *
 * 전부 반품은 주문 상태 → 환불(PG) → 신청 닫기 순으로 간다. 환불은 바깥을 부르므로 한 덩이로 묶을 수 없고,
 * 인스턴스가 내려가거나 PG 가 늦게 답하면 그 사이에서 멈춘다. 예전에는 그 자리에서 **같은 문으로 다시 끝낼 수
 * 없었다** — 첫 걸음이 "반품접수일 때만" 이라 두 번째 누름이 "이미 처리된 주문입니다" 로 막혔고, 돈이 이미
 * 나갔다면 신청은 반품 대기줄에 영영 남았다.
 */
describe('중간에 끊긴 뒤 다시 누르면', () => {
  const approved = [{ id: 'rr-1', status: 'APPROVED', reason: 'DEFECT', itemIds: ['i-coat', 'i-knit'] }];

  it('환불 전에 끊겼으면 — 주문은 이미 옮겨졌으니 환불부터 이어서 한다', async () => {
    // 첫 걸음까지만 끝난 자리: 주문은 반품완료, 신청은 승인된 채
    useOrder(order({ status: 'RETURNED', returnRequests: approved }));
    refundOrder.mockResolvedValue({ orderStatus: 'REFUNDED', refunded: 81_000, pointsReturned: 0 });

    const result = await completeReturn('20260914-0000002', admin, gateway());

    // 상태를 또 옮기려 들지 않는다 — 그 조건은 이제 맞지 않아 막히기만 한다
    expect(tx.order.updateMany).not.toHaveBeenCalled();
    expect(refundOrder, '돈이 아직 안 나갔다 — 환불은 해야 한다').toHaveBeenCalled();
    expect(db.returnRequest.updateMany.mock.calls[0]![0].data.status).toBe('COMPLETED');
    expect(result).toMatchObject({ kind: 'full', refunded: 81_000 });
  });

  it('환불까지 갔으면 — 돈은 두 번 내보내지 않고 신청만 닫는다', async () => {
    // 돈은 나갔는데 신청을 닫다 끊긴 자리
    useOrder(order({ status: 'REFUNDED', returnRequests: approved }));
    db.orderRefund.aggregate.mockResolvedValue({
      _sum: { amount: 81_000, points: 0, shippingDeducted: 0 }, _count: { _all: 1 },
    });

    const result = await completeReturn('20260914-0000002', admin, gateway());

    expect(refundOrder, '이미 환불된 주문을 또 부르면 거절당하고, 신청은 영영 안 닫힌다').not.toHaveBeenCalled();
    expect(db.returnRequest.updateMany.mock.calls[0]![0].data.status).toBe('COMPLETED');
    // 돌려준 몫은 장부에서 읽는다 — 화면이 0원이라고 말하면 안 된다
    expect(result).toMatchObject({ kind: 'full', refunded: 81_000 });
  });

  it('신청은 승인된 것만 닫는다 — 두 사람이 동시에 눌러도 처음 닫은 때가 남는다', async () => {
    useOrder(order({ status: 'RETURNED', returnRequests: approved }));
    refundOrder.mockResolvedValue({ orderStatus: 'REFUNDED', refunded: 81_000, pointsReturned: 0 });

    await completeReturn('20260914-0000002', admin, gateway());

    expect(db.returnRequest.updateMany.mock.calls[0]![0].where).toMatchObject({ id: 'rr-1', status: 'APPROVED' });
  });
});

/**
 * **물건이 돌아왔다 — 그 가게의 "재고 부족" 도 끝난 일일 수 있다.**
 *
 * 일부 반품은 여기서 직접 재고를 되살린다. 전부 반품은 환불 쪽(refundOrder)을 타고 거기서 묻는다 —
 * 두 곳이 같은 일을 두 번 하지 않도록 길을 갈라 둔다.
 */
describe('돌아온 재고로 재고 부족 알림을 닫으러 간다', () => {
  it('일부 반품은 돌려받은 줄의 옵션을 넘긴다', async () => {
    await completeReturn('20260914-0000002', admin, gateway());

    expect(clearLowStockForVariants).toHaveBeenCalledWith(['v-knit']);
  });
});

/**
 * **포인트로 낸 몫은 포인트로 돌려준다.**
 *
 * 붙박이 주문이 `pointsUsed: 0` 이라 **포인트 환급 갈래가 영영 안 돌았다** — 커버리지를
 * 켜서 찾았다. 그 두 줄(잔액 올리기·원장 적기)을 지워도 검사 스물셋이 전부 초록이었다.
 *
 * 지우면 손님은 **카드로 낸 몫만 돌려받고 포인트는 잃는다.** 조용히 그렇게 되고, 금액이
 * 맞는지는 손님이 직접 세어 보지 않으면 모른다.
 *
 * **원장으로 준다.** 잔액만 올리면 `PointTransaction` 합계와 어긋나고, 그 뒤로는 아무도
 * 알아채지 못한다(가입 포인트도 같은 까닭으로 같은 방식이다).
 */
describe('포인트로 낸 주문을 일부 반품하면', () => {
  /** 코트 60,000(포인트 4,000) · 니트 30,000(포인트 2,000, 반품 신청) · 쿠폰 9,000 */
  const withPoints = () => order({
    pointsUsed: 6_000, payable: 75_000,
    items: [
      { id: 'i-coat', variantId: 'v-coat', quantity: 1, subtotal: 60_000, status: 'DELIVERED',
        couponShare: 6_000, pointsShare: 4_000, rewardShare: 540, canceledAt: null },
      { id: 'i-knit', variantId: 'v-knit', quantity: 1, subtotal: 30_000, status: 'RETURN_REQUESTED',
        couponShare: 3_000, pointsShare: 2_000, rewardShare: 270, canceledAt: null },
    ],
  });

  it('그 줄에 쓴 포인트를 잔액에 돌려준다', async () => {
    useOrder(withPoints());
    const result = await completeReturn('20260914-0000002', admin, gateway());

    expect(result.pointsReturned).toBe(2_000);
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'u-1' }, data: { pointBalance: { increment: 2_000 } },
    });
  });

  it('원장에도 적는다 — 잔액만 올리면 합계와 어긋난다', async () => {
    useOrder(withPoints());
    await completeReturn('20260914-0000002', admin, gateway());

    expect(tx.pointTransaction.create.mock.calls[0]![0].data).toMatchObject({
      userId: 'u-1', amount: 2_000, reason: 'CANCEL_REFUND', orderId: 'o-1',
    });
    expect(tx.pointTransaction.create.mock.calls[0]![0].data.note).toContain('20260914-0000002');
  });

  /** 포인트 몫을 현금으로도 돌려주면 두 번 준다 — 돌려준 합이 그 줄 몫을 넘지 않아야 한다 */
  it('포인트 몫을 현금으로 두 번 돌려주지 않는다', async () => {
    useOrder(withPoints());
    const pg = gateway();
    const result = await completeReturn('20260914-0000002', admin, pg);

    expect(vi.mocked(pg.cancel).mock.calls[0]![0].amount).toBe(result.refunded);
    // 30,000 = 현금 + 포인트 + 쿠폰 몫 3,000 + 뗀 배송비
    expect(result.refunded + result.pointsReturned + 3_000 + result.shippingDeducted).toBe(30_000);
  });

  it('포인트를 안 쓴 주문에는 원장을 적지 않는다', async () => {
    await completeReturn('20260914-0000002', admin, gateway());

    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.pointTransaction.create).not.toHaveBeenCalled();
  });

  it('미리보기도 같은 수를 말한다 — 단추 옆 금액과 실제가 달라선 안 된다', async () => {
    useOrder(withPoints());
    const preview = await previewCompleteReturn('20260914-0000002', admin);
    const result = await completeReturn('20260914-0000002', admin, gateway());

    expect(preview).toMatchObject({
      kind: 'partial', cash: result.refunded, points: result.pointsReturned,
      shippingDeducted: result.shippingDeducted,
    });
  });
});

/**
 * **돈은 나갔는데 장부가 어긋났을 때.**
 *
 * PG 취소는 트랜잭션 안에서 부르지만 **되돌릴 수 없다.** 그 뒤 DB 반영이 실패하면 손님
 * 카드에서는 돈이 나갔고 우리 기록에는 없다 — 그때 `fatal` 로 보고해 운영 화면과 메일로
 * 사람에게 닿는다(`reportLedgerMismatch`). 예전에는 `console.error` 한 줄이 전부였고,
 * 주석은 스스로 "수동 대사 필요" 라고 적어 두었는데 그 대사를 할 사람에게 닿는 길이 없었다.
 *
 * **PG 를 부르기 전에 실패했으면 보고하지 않는다.** 그때는 돈이 움직이지 않았으니 어긋난
 * 것이 없다 — 보고가 쏟아지면 진짜 어긋남이 묻힌다. 그 가름이 `pgDone` 한 줄이다.
 */
describe('돈이 나간 뒤 장부가 깨지면', () => {
  it('보고하고, 원래 오류는 그대로 올린다', async () => {
    tx.orderRefund.create.mockRejectedValue(new Error('장부를 적지 못했다'));

    await expect(completeReturn('20260914-0000002', admin, gateway()))
      .rejects.toThrow('장부를 적지 못했다');

    expect(reportLedgerMismatch).toHaveBeenCalledTimes(1);
    const [call] = reportLedgerMismatch.mock.calls[0]! as [{ stage: string; orderNo: string; detail: { idempotencyKey: string } }];
    expect(call.stage).toBe('return.complete');
    expect(call.orderNo).toBe('20260914-0000002');
    // 대사에 필요한 것 — "다시 눌러도 되는가" 를 멱등키로 판단한다
    expect(call.detail.idempotencyKey).toContain('return-20260914-0000002-');
  });

  it('PG 를 부르기 전에 실패했으면 보고하지 않는다 — 돈이 움직이지 않았다', async () => {
    // 잠근 뒤 다시 읽었더니 주문이 없다 — PG 보다 앞이다
    tx.order.findFirst.mockResolvedValue(null);

    await expect(completeReturn('20260914-0000002', admin, gateway()))
      .rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' });

    expect(reportLedgerMismatch).not.toHaveBeenCalled();
  });

  /** 돌려줄 현금이 없으면 PG 를 아예 부르지 않는다 — 그때 실패해도 어긋남이 아니다 */
  it('현금 환불이 없는 반품이 깨져도 보고하지 않는다', async () => {
    // 전액을 포인트로 낸 줄 — 현금 몫이 0 이다
    useOrder(order({
      pointsUsed: 27_000, payable: 54_000,
      items: [
        { id: 'i-coat', variantId: 'v-coat', quantity: 1, subtotal: 60_000, status: 'DELIVERED',
          couponShare: 6_000, pointsShare: 0, rewardShare: 540, canceledAt: null },
        { id: 'i-knit', variantId: 'v-knit', quantity: 1, subtotal: 30_000, status: 'RETURN_REQUESTED',
          couponShare: 3_000, pointsShare: 27_000, rewardShare: 270, canceledAt: null },
      ],
    }));
    tx.orderRefund.create.mockRejectedValue(new Error('장부를 적지 못했다'));
    const pg = gateway();

    await expect(completeReturn('20260914-0000002', admin, pg)).rejects.toThrow('장부를 적지 못했다');

    expect(pg.cancel).not.toHaveBeenCalled();
    expect(reportLedgerMismatch).not.toHaveBeenCalled();
  });
});

/**
 * **두 사람이 같은 단추를 동시에 누르면.**
 *
 * 돈이 나가는 자리라 "두 번째 누름이 아무 일도 하지 않는다" 로는 부족하다 — 두 번째가
 * **지나가면** 돈이 두 번 나간다. 그래서 바꾸는 줄마다 조건을 달고(`where` 에 지금 상태를
 * 적는다), 바뀐 줄 수가 기대와 다르면 **트랜잭션을 되돌린다.**
 *
 * 그 되돌림이 전부 안 돈 줄이었다. 조건을 떼도 지는 검사가 없었다.
 */
describe('동시에 누르면', () => {
  const allLines = [{ id: 'rr-1', status: 'APPROVED', reason: 'DEFECT', itemIds: ['i-coat', 'i-knit'] }];

  it('전부 반품 — 주문이 이미 옮겨졌으면 되돌린다', async () => {
    useOrder(order({ returnRequests: allLines }));
    tx.order.updateMany.mockResolvedValue({ count: 0 });

    await expect(completeReturn('20260914-0000002', admin, gateway()))
      .rejects.toMatchObject({ code: 'ALREADY_PROCESSED' });
    expect(refundOrder).not.toHaveBeenCalled();
  });

  it('일부 반품 — 잠근 뒤 보니 그 줄이 이미 처리됐으면 되돌린다', async () => {
    // 처음 읽을 때는 살아 있었는데, 잠그고 다시 읽으니 취소돼 있다
    tx.order.findFirst.mockResolvedValue(order({
      items: [
        { id: 'i-coat', variantId: 'v-coat', quantity: 1, subtotal: 60_000, status: 'DELIVERED',
          couponShare: 6_000, pointsShare: 0, rewardShare: 540, canceledAt: null },
        { id: 'i-knit', variantId: 'v-knit', quantity: 1, subtotal: 30_000, status: 'REFUNDED',
          couponShare: 3_000, pointsShare: 0, rewardShare: 270, canceledAt: new Date('2026-09-15') },
      ],
    }));

    await expect(completeReturn('20260914-0000002', admin, gateway()))
      .rejects.toMatchObject({ code: 'ALREADY_PROCESSED' });
  });

  it('일부 반품 — 줄의 상태가 그사이 바뀌었으면 되돌린다', async () => {
    tx.orderItem.updateMany.mockResolvedValue({ count: 0 });

    await expect(completeReturn('20260914-0000002', admin, gateway()))
      .rejects.toMatchObject({ code: 'ALREADY_PROCESSED' });
  });

  it('일부 반품 — 주문이 그사이 다른 자리로 갔으면 되돌린다', async () => {
    tx.order.updateMany.mockResolvedValue({ count: 0 });

    await expect(completeReturn('20260914-0000002', admin, gateway()))
      .rejects.toMatchObject({ code: 'ALREADY_PROCESSED' });
  });

  /**
   * 트랜잭션이 본문을 돌리지 않고 끝나는 길은 앱에 없다. 타입이 요구하는 바닥이고
   * (`result` 가 `null` 일 수 있다), 그 바닥이 **성공처럼 보이지 않는다**는 것만 적어 둔다 —
   * `null` 을 그대로 돌려주면 창구가 "환불 0원" 을 성공으로 답한다.
   */
  it('트랜잭션이 아무것도 하지 않고 끝나면 성공이라 하지 않는다', async () => {
    db.$transaction.mockResolvedValue(undefined);

    await expect(completeReturn('20260914-0000002', admin, gateway()))
      .rejects.toMatchObject({ code: 'ALREADY_PROCESSED' });
  });
});

/**
 * **거절은 무엇이 없는지 말한다.**
 *
 * 전부 `ReturnError` 로 나가 창구가 상태 코드와 함께 돌려준다. 404 와 409 를 섞으면
 * 운영자는 "다시 누르면 되는 것" 과 "뭔가 잘못된 것" 을 가를 수 없다.
 */
describe('돌려줄 것이 없을 때', () => {
  it('신청이 아예 없으면 404', async () => {
    useOrder(order({ returnRequests: [] }));

    await expect(completeReturn('20260914-0000002', admin, gateway()))
      .rejects.toMatchObject({ code: 'NO_REQUEST', status: 404 });
    await expect(previewCompleteReturn('20260914-0000002', admin))
      .rejects.toMatchObject({ code: 'NO_REQUEST', status: 404 });
  });

  it('주문이 없으면 404', async () => {
    db.order.findFirst.mockResolvedValue(null);

    await expect(completeReturn('20260914-0000002', admin, gateway()))
      .rejects.toMatchObject({ code: 'ORDER_NOT_FOUND', status: 404 });
    await expect(previewCompleteReturn('20260914-0000002', admin))
      .rejects.toMatchObject({ code: 'ORDER_NOT_FOUND', status: 404 });
  });

  it('신청한 줄이 이미 다 취소됐으면 돌려받을 상품이 없다', async () => {
    useOrder(order({
      items: [
        { id: 'i-coat', variantId: 'v-coat', quantity: 1, subtotal: 60_000, status: 'DELIVERED',
          couponShare: 6_000, pointsShare: 0, rewardShare: 540, canceledAt: null },
        { id: 'i-knit', variantId: 'v-knit', quantity: 1, subtotal: 30_000, status: 'REFUNDED',
          couponShare: 3_000, pointsShare: 0, rewardShare: 270, canceledAt: new Date('2026-09-15') },
      ],
    }));

    await expect(completeReturn('20260914-0000002', admin, gateway()))
      .rejects.toMatchObject({ code: 'NO_ITEMS' });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  /** 받은 적 없는 결제를 취소할 수는 없다 — 그때 PG 를 부르면 그쪽이 거절한다 */
  it('현금을 돌려줘야 하는데 받은 결제가 없으면 막는다', async () => {
    useOrder(order({ payment: { id: 'p-1', status: 'READY', pgPaymentKey: null, refundedAmount: 0 } }));
    const pg = gateway();

    await expect(completeReturn('20260914-0000002', admin, pg))
      .rejects.toMatchObject({ code: 'NOTHING_TO_REFUND' });
    expect(pg.cancel).not.toHaveBeenCalled();
  });
});

/**
 * **미리보기도 같은 문을 지난다.**
 *
 * 운영 화면이 단추 옆에 금액을 띄우는 길인데, 권한도 보고 없는 주문도 거른다. 미리보기만
 * 열어 두면 **권한 없는 사람이 남의 주문 금액을 읽는다** — 바꾸지 않아도 새는 것이다.
 */
describe('미리보기의 문', () => {
  it('가맹점은 금액도 볼 수 없다', async () => {
    await expect(previewCompleteReturn('20260914-0000002', merchant))
      .rejects.toMatchObject({ status: 403 });
    expect(db.order.findFirst).not.toHaveBeenCalled();
  });

  it('신청한 줄이 산 줄 전부면 "전부" 라고만 답한다 — 금액은 기존 환불이 정한다', async () => {
    useOrder(order({ returnRequests: [{ id: 'rr-1', status: 'APPROVED', reason: 'DEFECT', itemIds: ['i-coat', 'i-knit'] }] }));

    expect(await previewCompleteReturn('20260914-0000002', admin)).toEqual({ kind: 'full' });
    expect(db.orderRefund.aggregate).not.toHaveBeenCalled();
  });
});

/**
 * **금액 규칙이 거절한 것과 우리가 모르는 고장은 다르다.**
 *
 * 금액 셈은 core 가 한다(`planPartialCancel`). 거기서 나온 거절은 운영자에게 보여 줄 말이
 * 있으므로 `ReturnError` 로 옮겨 **코드를 그대로** 쓴다. 그런데 **우리가 모르는 오류까지
 * 감싸면** 버그가 4xx 로 포장되어 나가고, 운영자는 자기가 뭘 잘못 적은 줄 안다.
 */
describe('금액 셈이 거절하면', () => {
  /** 1,000원짜리 줄을 돌려받는데 뗄 배송비가 3,000원이다 — 돌려줄 돈보다 뗄 돈이 많다 */
  const tooSmall = () => order({
    couponDiscount: 0, payable: 61_000,
    items: [
      { id: 'i-coat', variantId: 'v-coat', quantity: 1, subtotal: 60_000, status: 'DELIVERED',
        couponShare: 0, pointsShare: 0, rewardShare: 540, canceledAt: null },
      { id: 'i-sock', variantId: 'v-sock', quantity: 1, subtotal: 1_000, status: 'RETURN_REQUESTED',
        couponShare: 0, pointsShare: 0, rewardShare: 10, canceledAt: null },
    ],
    returnRequests: [{ id: 'rr-1', status: 'APPROVED', reason: 'CHANGED_MIND', itemIds: ['i-sock'] }],
  });

  it('core 의 코드를 그대로 쓰면서 우리 오류로 옮긴다', async () => {
    useOrder(tooSmall());

    /*
     * **이름까지 본다.** `PartialCancelError` 도 `code` 를 들고 있어서 코드만 보면 옮기는
     * 줄을 지워도 통과한다 — 돌연변이로 그것을 확인하고 단정을 넓혔다. 창구가 상태 코드를
     * 읽는 것은 `ReturnError` 이므로, 옮기지 않으면 500 으로 나간다.
     */
    await expect(previewCompleteReturn('20260914-0000002', admin))
      .rejects.toMatchObject({ name: 'ReturnError', code: 'SHIPPING_EXCEEDS_REFUND', status: 409 });
  });

  it('우리가 모르는 고장은 감싸지 않고 그대로 올린다', async () => {
    // 금액 칸이 깨진 줄 — core 의 won() 이 MoneyError 를 던진다
    useOrder(order({
      items: [
        { id: 'i-coat', variantId: 'v-coat', quantity: 1, subtotal: 60_000.5, status: 'DELIVERED',
          couponShare: 6_000, pointsShare: 0, rewardShare: 540, canceledAt: null },
        { id: 'i-knit', variantId: 'v-knit', quantity: 1, subtotal: 30_000, status: 'RETURN_REQUESTED',
          couponShare: 3_000, pointsShare: 0, rewardShare: 270, canceledAt: null },
      ],
    }));

    await expect(previewCompleteReturn('20260914-0000002', admin))
      .rejects.toMatchObject({ name: 'MoneyError' });
  });
});
