import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

/**
 * 교환 — 신청 반려와 교환 상품 발송.
 *
 * 교환은 **돈이 움직이지 않는 반품**이다. 여기서 보는 것: 반려하면 잡아 둔 재고를 풀고, 보내면 돌아온 옵션 재고가
 * 늘고 주문 줄이 바꾼 옵션을 가리키며 주문은 신청 전 자리로, 송장은 신청에 따로 남는다. 그리고 반품의 환불 길을
 * 타지 않는다.
 */

const tx = vi.hoisted(() => ({
  order: { updateMany: vi.fn<(...a: any[]) => any>() },
  orderItem: { updateMany: vi.fn<(...a: any[]) => any>() },
  productVariant: { updateMany: vi.fn<(...a: any[]) => any>() },
  returnRequest: { update: vi.fn<(...a: any[]) => any>(), updateMany: vi.fn<(...a: any[]) => any>() },
  orderStatusLog: { create: vi.fn<(...a: any[]) => any>() },
}));
const db = vi.hoisted(() => ({
  order: { findFirst: vi.fn<(...a: any[]) => any>() },
  $transaction: vi.fn<(...a: any[]) => any>(),
}));
vi.mock('@shop/db', () => ({ prisma: db }));
const notifyExchangeShipped = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/orders/notify-exchange', () => ({ notifyExchangeShipped }));

const { completeExchange } = await import('~/lib/orders/complete-exchange');
const { resolveReturn } = await import('~/lib/orders/return-request');

const admin: Actor = { id: 'u-admin', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };
const otherMerchant: Actor = { id: 'u-x', role: 'MERCHANT', merchantId: 'm-x' };

const LINE = { orderItemId: 'i-knit', fromVariantId: 'v-knit-s', fromOptionLabel: '블랙 / S', toVariantId: 'v-knit-m', toOptionLabel: '블랙 / M', quantity: 2 };

const order = (request: Record<string, unknown> = {}, over: Record<string, unknown> = {}) => ({
  id: 'o-1', orderNo: '20260915-0000001', status: 'RETURN_REQUESTED', userId: 'u-buyer',
  confirmedAt: null, deliveredAt: new Date('2026-09-12'),
  items: [
    { id: 'i-coat', status: 'DELIVERED', canceledAt: null, merchantId: 'm-a' },
    { id: 'i-knit', status: 'RETURN_REQUESTED', canceledAt: null, merchantId: 'm-a' },
  ],
  returnRequests: [{
    id: 'rr-1', type: 'EXCHANGE', status: 'APPROVED', itemIds: ['i-knit'], receivedAt: null, exchangeLines: [LINE], ...request,
  }],
  ...over,
});

const SHIP = { carrier: 'CJ' as const, trackingNumber: '1234-5678-9012' };
const NOW = new Date('2026-09-15T03:00:00Z');

beforeEach(() => {
  vi.clearAllMocks();
  db.order.findFirst.mockResolvedValue(order());
  db.$transaction.mockImplementation(async (fn: any) => fn(tx));
  tx.returnRequest.updateMany.mockResolvedValue({ count: 1 });
  tx.orderItem.updateMany.mockResolvedValue({ count: 1 });
  tx.order.updateMany.mockResolvedValue({ count: 1 });
  tx.productVariant.updateMany.mockResolvedValue({ count: 1 });
});

describe('교환 상품 발송', () => {
  it('돌아온 옵션 재고를 늘리고, 줄이 바꾼 옵션을 가리키게 하고, 주문을 신청 전 자리로 되돌린다', async () => {
    const result = await completeExchange('20260915-0000001', SHIP, admin, NOW);

    expect(tx.productVariant.updateMany).toHaveBeenCalledWith({ where: { id: 'v-knit-s' }, data: { stock: { increment: 2 } } });
    // 바꿀 옵션은 신청 때 이미 잡혔다 — 여기서 또 깎으면 두 번 깎는다
    expect(tx.productVariant.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.orderItem.updateMany).toHaveBeenCalledWith({
      where: { id: 'i-knit', orderId: 'o-1', status: 'RETURN_REQUESTED', canceledAt: null },
      data: { variantId: 'v-knit-m', optionLabel: '블랙 / M', status: 'DELIVERED' },
    });
    expect(tx.order.updateMany.mock.calls[0]?.[0].data).toEqual({ status: 'DELIVERED' });
    expect(result).toEqual({ orderNo: '20260915-0000001', orderStatus: 'DELIVERED', exchanged: 1 });
  });

  it('송장은 숫자만 남겨 신청에 적고, 회수 확인이 없었으면 함께 찍는다 — 주문의 첫 송장은 건드리지 않는다', async () => {
    await completeExchange('20260915-0000001', SHIP, admin, NOW);
    expect(tx.returnRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 'rr-1', status: 'APPROVED' },
      data: {
        status: 'COMPLETED', resolvedAt: NOW, resolvedBy: 'u-admin',
        reshipCarrier: 'CJ', reshipTrackingNumber: '123456789012', reshippedAt: NOW,
        receivedAt: NOW, receivedBy: 'u-admin',
      },
    });
    expect(tx).not.toHaveProperty('shipment');
  });

  it('돈이 안 움직여 가맹점도 자기 상품 교환을 끝낸다. 남의 가맹점 주문은 없는 주문이다', async () => {
    await expect(completeExchange('20260915-0000001', SHIP, merchant, NOW)).resolves.toBeTruthy();
    await expect(completeExchange('20260915-0000001', SHIP, otherMerchant, NOW)).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' });
  });

  it('반품 신청·승인 전·이미 보낸 신청은 거절한다', async () => {
    db.order.findFirst.mockResolvedValue(order({ type: 'RETURN' }));
    await expect(completeExchange('20260915-0000001', SHIP, admin)).rejects.toMatchObject({ code: 'NOT_EXCHANGE' });
    db.order.findFirst.mockResolvedValue(order({ status: 'REQUESTED' }));
    await expect(completeExchange('20260915-0000001', SHIP, admin)).rejects.toMatchObject({ code: 'NOT_APPROVED' });
    db.order.findFirst.mockResolvedValue(order({ status: 'COMPLETED' }));
    await expect(completeExchange('20260915-0000001', SHIP, admin)).rejects.toThrow('이미 교환 상품을 보낸');
  });

  it('두 사람이 동시에 누르면 한 번만 — 신청을 조건부로 닫지 못하면 재고를 건드리지 않는다', async () => {
    tx.returnRequest.updateMany.mockResolvedValue({ count: 0 });
    await expect(completeExchange('20260915-0000001', SHIP, admin)).rejects.toMatchObject({ code: 'ALREADY_PROCESSED' });
    expect(tx.productVariant.updateMany).not.toHaveBeenCalled();
    expect(notifyExchangeShipped, '처리되지 않은 교환을 보냈다고 알렸다').not.toHaveBeenCalled();
  });

  it('보낸 뒤 손님에게 알린다 — 주문·송장(숫자만)·바꾼 줄을 넘기고, 교환 처리가 끝난 다음이다', async () => {
    const order: string[] = [];
    db.$transaction.mockImplementation(async (fn: any) => { order.push('tx'); return fn(tx); });
    notifyExchangeShipped.mockImplementation(() => { order.push('notify'); return Promise.resolve(); });
    await completeExchange('20260915-0000001', SHIP, admin, NOW);
    expect(notifyExchangeShipped).toHaveBeenCalledWith({
      orderNo: '20260915-0000001', userId: 'u-buyer', carrier: 'CJ', trackingNumber: '123456789012', lines: [LINE],
    });
    expect(order).toEqual(['tx', 'notify']);
  });

  it('확정까지 갔던 주문은 확정으로 돌아간다 — 확정일을 다시 쓰지 않는다', async () => {
    db.order.findFirst.mockResolvedValue(order({}, { confirmedAt: new Date('2026-09-13') }));
    const result = await completeExchange('20260915-0000001', SHIP, admin, NOW);
    expect(result.orderStatus).toBe('CONFIRMED');
    expect(tx.order.updateMany.mock.calls[0]?.[0].data).toEqual({ status: 'CONFIRMED' });
  });
});

describe('교환 반려', () => {
  it('잡아 둔 바꿀 옵션의 재고를 풀어 준다', async () => {
    db.order.findFirst.mockResolvedValue(order({ status: 'REQUESTED' }));
    const txAll = { ...tx, returnRequest: { update: vi.fn() } };
    db.$transaction.mockImplementation(async (fn: any) => fn(txAll));

    await resolveReturn('20260915-0000001', { action: 'REJECT', rejectReason: '사진상 사용 흔적' }, admin);
    expect(tx.productVariant.updateMany).toHaveBeenCalledWith({ where: { id: 'v-knit-m' }, data: { stock: { increment: 2 } } });
    expect(tx.orderStatusLog.create.mock.calls[0]?.[0].data.note).toContain('교환 반려');
  });

  it('반품 반려는 재고를 건드리지 않는다', async () => {
    db.order.findFirst.mockResolvedValue(order({ type: 'RETURN', status: 'REQUESTED', exchangeLines: [] }));
    db.$transaction.mockImplementation(async (fn: any) => fn({ ...tx, returnRequest: { update: vi.fn() } }));
    await resolveReturn('20260915-0000001', { action: 'REJECT', rejectReason: '기한 지남' }, admin);
    expect(tx.productVariant.updateMany).not.toHaveBeenCalled();
  });
});
