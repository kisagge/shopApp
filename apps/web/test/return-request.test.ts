import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

const db = vi.hoisted(() => ({
  order: { findFirst: vi.fn<(...a: any[]) => any>(), updateMany: vi.fn<(...a: any[]) => any>() },
  orderItem: { updateMany: vi.fn<(...a: any[]) => any>() },
  orderStatusLog: { create: vi.fn<(...a: any[]) => any>() },
  returnRequest: { create: vi.fn<(...a: any[]) => any>(), update: vi.fn<(...a: any[]) => any>(), updateMany: vi.fn<(...a: any[]) => any>() },
  productVariant: { findMany: vi.fn<(...a: any[]) => any>(), updateMany: vi.fn<(...a: any[]) => any>() },
  $transaction: vi.fn<(...a: any[]) => any>(),
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const { requestReturn, resolveReturn, receiveReturn } = await import('~/lib/orders/return-request');

const user = { id: 'u-1' };
const admin: Actor = { id: 'u-admin', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };

const DAY = 24 * 60 * 60 * 1000;
const delivered = new Date('2026-09-01T10:00:00+09:00');
const now = new Date(delivered.getTime() + 2 * DAY);

const order = (over: Record<string, unknown> = {}) => ({
  id: 'o-1', orderNo: '20260901-0000001', status: 'DELIVERED',
  deliveredAt: delivered, confirmedAt: null,
  items: [
    { id: 'i-coat', status: 'DELIVERED', canceledAt: null, quantity: 1, optionLabel: '오트 / M', variant: { id: 'v-coat-m', productId: 'p-coat', priceOverride: null } },
    { id: 'i-knit', status: 'DELIVERED', canceledAt: null, quantity: 2, optionLabel: '블랙 / S', variant: { id: 'v-knit-s', productId: 'p-knit', priceOverride: null } },
    { id: 'i-sock', status: 'CANCELLED', canceledAt: new Date('2026-08-30'), quantity: 1, optionLabel: 'FREE', variant: { id: 'v-sock', productId: 'p-sock', priceOverride: null } },
  ],
  returnRequests: [{ id: 'rr-1', type: 'RETURN', status: 'REQUESTED', itemIds: [], exchangeLines: [] }],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.order.findFirst.mockResolvedValue(order());
  db.order.updateMany.mockResolvedValue({ count: 1 });
  db.$transaction.mockImplementation(async (fn: any) => fn(db));
  db.productVariant.updateMany.mockResolvedValue({ count: 1 });
  db.productVariant.findMany.mockResolvedValue([
    { id: 'v-knit-m', productId: 'p-knit', priceOverride: null, stock: 5, isActive: true, label: '블랙 / M' },
    { id: 'v-knit-xl', productId: 'p-knit', priceOverride: 5000, stock: 5, isActive: true, label: '블랙 / XL' },
    { id: 'v-coat-l', productId: 'p-coat', priceOverride: null, stock: 1, isActive: true, label: '오트 / L' },
  ]);
});

describe('반송비는 서버가 사유에서 정한다', () => {
  it('단순 변심이면 고객 부담', async () => {
    const r = await requestReturn('20260901-0000001', { type: 'RETURN', reason: 'CHANGED_MIND' }, user, now);

    expect(r.shippingBorneBy).toBe('CUSTOMER');
    expect(db.returnRequest.create.mock.calls[0]?.[0].data).toMatchObject({
      shippingBorneBy: 'CUSTOMER',
    });
  });

  it('불량이면 판매자 부담', async () => {
    const r = await requestReturn('20260901-0000001', { type: 'RETURN', reason: 'DEFECT' }, user, now);

    expect(r.shippingBorneBy).toBe('SELLER');
  });

  it('요청에 부담 주체를 끼워 넣어도 무시한다', async () => {
    // 받아 쓰면 누구나 SELLER 를 보내 반송비를 넘길 수 있다
    await requestReturn(
      '20260901-0000001',
      { type: 'RETURN', reason: 'CHANGED_MIND', shippingBorneBy: 'SELLER' } as never,
      user,
      now,
    );

    expect(db.returnRequest.create.mock.calls[0]?.[0].data).toMatchObject({
      shippingBorneBy: 'CUSTOMER',
    });
  });
});

describe('신청 자격', () => {
  it('남의 주문에는 신청할 수 없다 — 조회에 userId 를 건다', async () => {
    await requestReturn('20260901-0000001', { type: 'RETURN', reason: 'DEFECT' }, user, now);

    expect(db.order.findFirst.mock.calls[0]?.[0].where).toMatchObject({ userId: 'u-1' });
  });

  it('없는 주문은 404', async () => {
    db.order.findFirst.mockResolvedValue(null);

    await expect(
      requestReturn('20260901-9999999', { type: 'RETURN', reason: 'DEFECT' }, user, now),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('변심 기한이 지나면 거절한다', async () => {
    const late = new Date(delivered.getTime() + 8 * DAY);

    await expect(
      requestReturn('20260901-0000001', { type: 'RETURN', reason: 'CHANGED_MIND' }, user, late),
    ).rejects.toMatchObject({ code: 'WINDOW_CLOSED' });
    expect(db.returnRequest.create).not.toHaveBeenCalled();
  });

  it('같은 시점이라도 하자는 아직 받는다', async () => {
    const late = new Date(delivered.getTime() + 8 * DAY);

    const r = await requestReturn('20260901-0000001', { type: 'RETURN', reason: 'DEFECT' }, user, late);

    expect(r.orderStatus).toBe('RETURN_REQUESTED');
  });

  /**
   * 확정은 "이대로 받겠다" 는 뜻이지 판매자 잘못까지 떠안겠다는 뜻이 아니다.
   * 예전에는 사유를 묻지도 않고 막고 "고객센터로 문의해 주세요" 를 내보냈는데,
   * 그 뒤가 코드에 없었다.
   */
  it('구매확정된 주문도 하자면 받는다', async () => {
    db.order.findFirst.mockResolvedValue(order({ status: 'CONFIRMED' }));

    const r = await requestReturn(
      '20260901-0000001', { type: 'RETURN', reason: 'DEFECT' }, user, now,
    );

    expect(r.orderStatus).toBe('RETURN_REQUESTED');
  });

  it('구매확정된 주문에 단순 변심은 여전히 막는다', async () => {
    db.order.findFirst.mockResolvedValue(order({ status: 'CONFIRMED' }));

    await expect(
      requestReturn('20260901-0000001', { type: 'RETURN', reason: 'CHANGED_MIND' }, user, now),
    ).rejects.toMatchObject({ code: 'ALREADY_CONFIRMED' });
  });

  it('출고 전이면 취소로 안내한다', async () => {
    db.order.findFirst.mockResolvedValue(order({ status: 'PAID', deliveredAt: null }));

    await expect(
      requestReturn('20260901-0000001', { type: 'RETURN', reason: 'CHANGED_MIND' }, user, now),
    ).rejects.toMatchObject({ code: 'NOT_SHIPPED' });
  });

  it('그 사이 상태가 바뀌었으면 조건부 UPDATE 가 0건을 낸다', async () => {
    db.order.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      requestReturn('20260901-0000001', { type: 'RETURN', reason: 'DEFECT' }, user, now),
    ).rejects.toMatchObject({ code: 'ALREADY_PROCESSED' });
  });
});

describe('교환도 같은 창구로 받는다', () => {
  it('교환 신청은 반품과 같은 상태를 지난다', async () => {
    const r = await requestReturn(
      '20260901-0000001',
      { type: 'EXCHANGE', reason: 'DEFECT', itemIds: ['i-knit'], exchanges: [{ itemId: 'i-knit', variantId: 'v-knit-m' }] },
      user, now,
    );

    expect(r.type).toBe('EXCHANGE');
    expect(r.orderStatus).toBe('RETURN_REQUESTED');
    expect(db.orderStatusLog.create.mock.calls[0]?.[0].data.note).toContain('교환');
  });
});

describe('교환 신청', () => {
  const exchange = (exchanges: { itemId: string; variantId: string }[], itemIds = ['i-knit']) =>
    requestReturn('20260901-0000001', { type: 'EXCHANGE', reason: 'CHANGED_MIND', itemIds, exchanges }, user, now);

  it('바꿀 옵션의 재고를 수량만큼 조건부로 잡고, 원래·바꿀 옵션을 줄로 남긴다', async () => {
    await exchange([{ itemId: 'i-knit', variantId: 'v-knit-m' }]);

    expect(db.productVariant.updateMany).toHaveBeenCalledWith({
      where: { id: 'v-knit-m', isActive: true, stock: { gte: 2 } },
      data: { stock: { decrement: 2 } },
    });
    expect(db.returnRequest.create.mock.calls[0]?.[0].data.exchangeLines).toEqual({
      create: [{
        orderItemId: 'i-knit', fromVariantId: 'v-knit-s', fromOptionLabel: '블랙 / S',
        toVariantId: 'v-knit-m', toOptionLabel: '블랙 / M', quantity: 2,
      }],
    });
  });

  it('그 사이 재고가 팔려 나갔으면(조건부 0건) 신청 전체를 되돌린다', async () => {
    db.productVariant.updateMany.mockResolvedValue({ count: 0 });
    await expect(exchange([{ itemId: 'i-knit', variantId: 'v-knit-m' }])).rejects.toMatchObject({ code: 'OUT_OF_STOCK' });
    expect(db.returnRequest.create).not.toHaveBeenCalled();
  });

  it('가격이 다른 옵션·다른 상품의 옵션·재고가 모자란 옵션은 거절한다', async () => {
    await expect(exchange([{ itemId: 'i-knit', variantId: 'v-knit-xl' }])).rejects.toMatchObject({ code: 'PRICE_DIFFERS' });
    await expect(exchange([{ itemId: 'i-knit', variantId: 'v-coat-l' }])).rejects.toMatchObject({ code: 'DIFFERENT_PRODUCT' });
    await expect(exchange([{ itemId: 'i-coat', variantId: 'v-coat-l' }], ['i-coat'])).resolves.toBeTruthy();
    db.productVariant.findMany.mockResolvedValue([{ id: 'v-knit-m', productId: 'p-knit', priceOverride: null, stock: 1, isActive: true, label: '블랙 / M' }]);
    await expect(exchange([{ itemId: 'i-knit', variantId: 'v-knit-m' }])).rejects.toMatchObject({ code: 'OUT_OF_STOCK' });
  });

  it('돌려보내는 줄마다 하나씩 — 빠지거나, 신청 안 한 줄에 붙이거나, 두 번 적으면 거절한다', async () => {
    await expect(exchange([], ['i-knit'])).rejects.toMatchObject({ code: 'EXCHANGE_MISMATCH' });
    await expect(exchange([{ itemId: 'i-coat', variantId: 'v-coat-l' }], ['i-knit'])).rejects.toMatchObject({ code: 'EXCHANGE_MISMATCH' });
    await expect(exchange(
      [{ itemId: 'i-knit', variantId: 'v-knit-m' }, { itemId: 'i-knit', variantId: 'v-knit-m' }],
    )).rejects.toMatchObject({ code: 'EXCHANGE_MISMATCH' });
    expect(db.productVariant.updateMany).not.toHaveBeenCalled();
  });

  it('반품에는 옵션을 받지 않는다 — 재고를 잡지 않는다', async () => {
    await requestReturn('20260901-0000001', { type: 'RETURN', reason: 'DEFECT', itemIds: ['i-knit'] }, user, now);
    expect(db.productVariant.updateMany).not.toHaveBeenCalled();
    expect(db.returnRequest.create.mock.calls[0]?.[0].data.exchangeLines).toBeUndefined();
  });
});

describe('운영진 처리', () => {
  const requested = {
    id: 'o-1', orderNo: '20260901-0000001', status: 'RETURN_REQUESTED',
    // Prisma 는 없는 시각을 null 로 준다. 픽스처도 그래야 진짜와 같다.
    confirmedAt: null, deliveredAt: delivered,
    items: [
      { id: 'i-coat', status: 'RETURN_REQUESTED', canceledAt: null, merchantId: 'm-a' },
      { id: 'i-knit', status: 'RETURN_REQUESTED', canceledAt: null, merchantId: 'm-b' },
    ],
    returnRequests: [{ id: 'r-1', type: 'RETURN', status: 'REQUESTED', itemIds: [], exchangeLines: [] }],
  };

  beforeEach(() => {
    db.order.findFirst.mockResolvedValue(requested);
  });

  it('가맹점은 신청한 줄이 전부 자기 상품이면 승인한다 — 물건을 받는 곳이 가맹점 창고다', async () => {
    db.order.findFirst.mockResolvedValue({
      ...requested,
      returnRequests: [{ id: 'r-1', type: 'RETURN', status: 'REQUESTED', itemIds: ['i-coat'], exchangeLines: [] }],
    });
    const r = await resolveReturn('20260901-0000001', { action: 'APPROVE' }, merchant);
    expect(r.status).toBe('APPROVED');
  });

  it('남의 상품이 섞인 신청은 가맹점이 처리하지 못하고, 운영진 몫이라고 말한다', async () => {
    // 옛 신청(줄 없음) — 반품접수인 줄 전부, 곧 두 가맹점 상품이다
    await expect(
      resolveReturn('20260901-0000001', { action: 'APPROVE' }, merchant),
    ).rejects.toMatchObject({ status: 403, code: 'MIXED_MERCHANTS' });
    expect(db.returnRequest.update).not.toHaveBeenCalled();
  });

  it('자기 상품이 하나도 없는 주문은 없는 주문으로 답한다 — 남의 주문인지 새지 않게', async () => {
    db.order.findFirst.mockResolvedValue({
      ...requested,
      items: requested.items.map((i) => ({ ...i, merchantId: 'm-z' })),
    });
    await expect(
      resolveReturn('20260901-0000001', { action: 'APPROVE' }, merchant),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('손님은 처리하지 못한다', async () => {
    await expect(
      resolveReturn('20260901-0000001', { action: 'APPROVE' }, { id: 'u-c', role: 'CUSTOMER', merchantId: null }),
    ).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });

  it('승인하면 주문 상태를 건드리지 않는다 — 환불은 별도 동작이다', async () => {
    const r = await resolveReturn('20260901-0000001', { action: 'APPROVE' }, admin);

    expect(r.status).toBe('APPROVED');
    expect(db.order.updateMany).not.toHaveBeenCalled();
  });

  it('반려하면 왔던 자리로 되돌린다 — 안 되돌리면 주문이 반품접수에 갇힌다', async () => {
    const r = await resolveReturn(
      '20260901-0000001',
      { action: 'REJECT', rejectReason: '사용 흔적이 있습니다' },
      admin,
    );

    expect(r.orderStatus).toBe('DELIVERED');
    expect(db.order.updateMany).toHaveBeenCalled();
  });

  it('반려 사유를 신청 행에 남긴다 — 고객에게 그대로 보인다', async () => {
    await resolveReturn(
      '20260901-0000001',
      { action: 'REJECT', rejectReason: '사용 흔적이 있습니다' },
      admin,
    );

    expect(db.returnRequest.update.mock.calls[0]?.[0].data).toMatchObject({
      status: 'REJECTED',
      rejectReason: '사용 흔적이 있습니다',
      resolvedBy: 'u-admin',
    });
  });

  it('이미 처리된 신청은 다시 처리하지 않는다', async () => {
    db.order.findFirst.mockResolvedValue({
      ...requested,
      returnRequests: [{ id: 'r-1', type: 'RETURN', status: 'APPROVED', itemIds: [], exchangeLines: [] }],
    });

    await expect(
      resolveReturn('20260901-0000001', { action: 'APPROVE' }, admin),
    ).rejects.toMatchObject({ code: 'ALREADY_RESOLVED' });
  });

  it('신청이 없으면 404', async () => {
    db.order.findFirst.mockResolvedValue({ ...requested, returnRequests: [] });

    await expect(
      resolveReturn('20260901-0000001', { action: 'APPROVE' }, admin),
    ).rejects.toMatchObject({ code: 'NO_REQUEST' });
  });
});

/**
 * 반려하면 **왔던 자리로** 되돌아가야 한다.
 *
 * 예전에는 무조건 배송중이었다. 구매확정에서도 반품이 올 수 있게 되면서
 * 깨졌다 — 확정된 주문이 배송중으로 되돌아가면 사람에게는 이미 받은 물건이
 * "배송중" 으로 보이고, 다시 확정될 때 `confirmedAt` 이 덮여 이미 지급한
 * 달의 매출이 다른 달로 옮겨간다.
 */
describe('반품을 반려했을 때', () => {
  const pending = { id: 'rr-1', type: 'RETURN', status: 'REQUESTED', itemIds: [], exchangeLines: [] };

  const resolveFrom = async (over: Record<string, unknown>) => {
    db.order.findFirst.mockResolvedValue(order({ ...over, returnRequests: [pending] }));
    return resolveReturn('20260901-0000001', { action: 'REJECT', rejectReason: '하자 아님' }, admin);
  };

  it('확정까지 갔던 주문은 확정으로 돌아간다', async () => {
    const r = await resolveFrom({ status: 'RETURN_REQUESTED', confirmedAt: delivered });

    expect(r.orderStatus).toBe('CONFIRMED');
  });

  it('배송완료까지 갔던 주문은 배송완료로 돌아간다', async () => {
    const r = await resolveFrom({ status: 'RETURN_REQUESTED', confirmedAt: null });

    expect(r.orderStatus).toBe('DELIVERED');
  });

  it('배송 중이었으면 배송중으로 돌아간다', async () => {
    const r = await resolveFrom({ status: 'RETURN_REQUESTED', confirmedAt: null, deliveredAt: null });

    expect(r.orderStatus).toBe('SHIPPED');
  });

  /** 확정 시각이 덮이면 이미 지급한 달의 매출이 다른 달로 옮겨간다 */
  it('되돌리면서 시각을 다시 쓰지 않는다', async () => {
    await resolveFrom({ status: 'RETURN_REQUESTED', confirmedAt: delivered });

    const [args] = db.order.updateMany.mock.calls.at(-1) as [{ data: Record<string, unknown> }];
    expect(args.data).not.toHaveProperty('confirmedAt');
    expect(args.data).not.toHaveProperty('deliveredAt');
  });
});

describe('줄을 골라 돌려보낸다', () => {
  it('고른 줄만 반품접수로 옮기고, 신청에 줄을 적는다', async () => {
    const r = await requestReturn(
      '20260901-0000001', { type: 'RETURN', reason: 'CHANGED_MIND', itemIds: ['i-knit'] }, user, now,
    );
    expect(r.itemIds).toEqual(['i-knit']);
    expect(db.orderItem.updateMany.mock.calls[0]![0].where).toMatchObject({ id: { in: ['i-knit'] }, canceledAt: null });
    expect(db.returnRequest.create.mock.calls[0]![0].data.itemIds).toEqual(['i-knit']);
  });

  it('고르지 않으면 받은 줄 전부 — 취소된 줄은 빼고', async () => {
    const r = await requestReturn('20260901-0000001', { type: 'RETURN', reason: 'DEFECT' }, user, now);
    expect(r.itemIds).toEqual(['i-coat', 'i-knit']);
  });

  it('이미 돈이 돌아간 줄이나 없는 줄은 고를 수 없다', async () => {
    await expect(requestReturn(
      '20260901-0000001', { type: 'RETURN', reason: 'DEFECT', itemIds: ['i-sock'] }, user, now,
    )).rejects.toMatchObject({ code: 'ITEM_NOT_RETURNABLE' });
    await expect(requestReturn(
      '20260901-0000001', { type: 'RETURN', reason: 'DEFECT', itemIds: ['zzz'] }, user, now,
    )).rejects.toMatchObject({ code: 'ITEM_NOT_RETURNABLE' });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('반려하면 신청한 줄만 되돌린다 — 나머지 줄은 원래 자리다', async () => {
    db.order.findFirst.mockResolvedValue(order({
      status: 'RETURN_REQUESTED',
      returnRequests: [{ id: 'rr-1', type: 'RETURN', status: 'REQUESTED', itemIds: ['i-knit'], exchangeLines: [] }],
    }));
    await resolveReturn('20260901-0000001', { action: 'REJECT', rejectReason: '사용 흔적' }, admin);
    expect(db.orderItem.updateMany.mock.calls[0]![0].where).toMatchObject({ id: { in: ['i-knit'] } });
  });

  it('옛 신청(줄 없음)을 반려하면 반품접수인 줄 전부를 되돌린다', async () => {
    db.order.findFirst.mockResolvedValue(order({ status: 'RETURN_REQUESTED' }));
    await resolveReturn('20260901-0000001', { action: 'REJECT', rejectReason: '사용 흔적' }, admin);
    expect(db.orderItem.updateMany.mock.calls[0]![0].where).toMatchObject({ status: 'RETURN_REQUESTED' });
  });
});

describe('회수 확인', () => {
  const approved = (over: Record<string, unknown> = {}) => order({
    status: 'RETURN_REQUESTED',
    items: [
      { id: 'i-coat', status: 'DELIVERED', canceledAt: null, merchantId: 'm-b' },
      { id: 'i-knit', status: 'RETURN_REQUESTED', canceledAt: null, merchantId: 'm-a' },
    ],
    returnRequests: [{ id: 'rr-1', type: 'RETURN', status: 'APPROVED', itemIds: ['i-knit'], exchangeLines: [], receivedAt: null }],
    ...over,
  });

  beforeEach(() => {
    db.returnRequest.updateMany.mockResolvedValue({ count: 1 });
  });

  it('가맹점이 자기 상품의 도착을 확인하면 시각과 사람을 남기고, 돈은 움직이지 않는다', async () => {
    db.order.findFirst.mockResolvedValue(approved());
    const at = new Date('2026-09-05T10:00:00+09:00');
    const r = await receiveReturn('20260901-0000001', merchant, at);

    expect(r.receivedAt).toBe(at);
    expect(db.returnRequest.updateMany.mock.calls[0]![0]).toMatchObject({
      where: { id: 'rr-1', status: 'APPROVED', receivedAt: null },
      data: { receivedAt: at, receivedBy: 'u-m' },
    });
    // 신청 행만 바뀐다 — 줄·주문·결제는 운영진의 환불이 옮긴다
    expect(db.orderItem.updateMany).not.toHaveBeenCalled();
    expect(db.order.updateMany).not.toHaveBeenCalled();
  });

  it('승인 전이면 확인할 수 없다', async () => {
    db.order.findFirst.mockResolvedValue(approved({
      returnRequests: [{ id: 'rr-1', type: 'RETURN', status: 'REQUESTED', itemIds: ['i-knit'], exchangeLines: [], receivedAt: null }],
    }));
    await expect(receiveReturn('20260901-0000001', merchant)).rejects.toMatchObject({ code: 'NOT_APPROVED' });
  });

  it('두 번 확인하지 않는다 — 동시에 눌러도 한 번만 찍힌다', async () => {
    db.order.findFirst.mockResolvedValue(approved({
      returnRequests: [{ id: 'rr-1', type: 'RETURN', status: 'APPROVED', itemIds: ['i-knit'], exchangeLines: [], receivedAt: new Date() }],
    }));
    await expect(receiveReturn('20260901-0000001', merchant)).rejects.toMatchObject({ code: 'ALREADY_RECEIVED' });

    db.order.findFirst.mockResolvedValue(approved());
    db.returnRequest.updateMany.mockResolvedValue({ count: 0 });
    await expect(receiveReturn('20260901-0000001', merchant)).rejects.toMatchObject({ code: 'ALREADY_RECEIVED' });
  });

  it('남의 상품 반품의 도착은 확인하지 못한다', async () => {
    db.order.findFirst.mockResolvedValue(approved({
      returnRequests: [{ id: 'rr-1', type: 'RETURN', status: 'APPROVED', itemIds: ['i-coat'], exchangeLines: [], receivedAt: null }],
    }));
    await expect(receiveReturn('20260901-0000001', merchant)).rejects.toMatchObject({ code: 'MIXED_MERCHANTS' });
  });
});
