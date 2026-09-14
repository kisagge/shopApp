import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

const db = vi.hoisted(() => ({
  merchant: { findMany: vi.fn<(...a: any[]) => any>() },
  orderItem: { groupBy: vi.fn<(...a: any[]) => any>() },
  settlement: { findMany: vi.fn<(...a: any[]) => any>(), upsert: vi.fn<(...a: any[]) => any>(), findUnique: vi.fn<(...a: any[]) => any>(), updateMany: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const { previewSettlements, closeSettlements, paySettlement } =
  await import('~/lib/admin/close-settlement');

const superAdmin: Actor = { id: 'u-s', role: 'SUPER_ADMIN', merchantId: null };
const admin: Actor = { id: 'u-a', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };
const customer: Actor = { id: 'u-c', role: 'CUSTOMER', merchantId: null };

/** 2026-08 이 끝난 뒤 */
const AFTER = new Date('2026-09-02T00:00:00Z');
/** 2026-08 진행 중 */
const DURING = new Date('2026-08-15T00:00:00Z');

beforeEach(() => {
  vi.clearAllMocks();
  db.merchant.findMany.mockResolvedValue([
    { id: 'm-a', name: '무어', commissionPercent: 15 },
    { id: 'm-b', name: '스튜디오눈', commissionPercent: 10 },
  ]);
  db.orderItem.groupBy
    .mockResolvedValueOnce([
      { merchantId: 'm-a', _sum: { subtotal: 1_000_000 }, _count: { _all: 4 } },
      { merchantId: 'm-b', _sum: { subtotal: 500_000 }, _count: { _all: 2 } },
    ])
    .mockResolvedValueOnce([{ merchantId: 'm-a', _sum: { subtotal: 100_000 } }]);
  db.settlement.findMany.mockResolvedValue([]);
  db.settlement.upsert.mockResolvedValue({ id: 's-1' });
});

describe('초안 계산', () => {
  it('가맹점별로 매출·수수료·환불을 묶는다', async () => {
    const drafts = await previewSettlements(admin, '2026-08');
    expect(drafts).toHaveLength(2);
    expect(drafts[0]).toMatchObject({
      merchantName: '무어',
      grossAmount: 1_000_000,
      commissionAmount: 150_000,
      refundAmount: 100_000,
      netAmount: 750_000,
      orderCount: 4,
    });
  });

  it('환불이 없는 가맹점은 0 으로 잡는다', async () => {
    const drafts = await previewSettlements(admin, '2026-08');
    expect(drafts[1]).toMatchObject({ refundAmount: 0, netAmount: 450_000 });
  });

  it('매출은 구매확정 시각으로 자른다 — 결제 시각이 아니다', async () => {
    await previewSettlements(admin, '2026-08');
    const where = db.orderItem.groupBy.mock.calls[0]?.[0].where;
    expect(where.order.confirmedAt.gte.toISOString()).toBe('2026-07-31T15:00:00.000Z');
    expect(where.order.confirmedAt.lt.toISOString()).toBe('2026-08-31T15:00:00.000Z');
  });

  /**
   * 정산 매출로 잡는 것은 구매확정된 주문뿐이다. 확정 전에 취소된 주문은
   * 정산에 실린 적이 없으므로, 그것을 빼면 가맹점이 **다른 주문으로 번 돈에서**
   * 받은 적 없는 금액만큼 깎인다. 전에는 `paidAt` 만 봐서 실제로 그랬다.
   */
  it('판매는 지금 주문 상태를 보지 않는다 — 확정 뒤 반품된 주문이 판 달에서 빠지지 않는다', async () => {
    /*
     * 예전에는 "구매확정 상태인 주문" 이었다. 확정 뒤 주문째 반품·환불되면 상태가 환불완료가 되어
     * 그 달 판매에서 빠지고, 차감에는 잡혔다 — 같은 달이면 두 번 깎인다. 반품을 접수만 해도 빠졌다.
     */
    await previewSettlements(admin, '2026-08');
    const where = db.orderItem.groupBy.mock.calls[0]?.[0].where;
    expect(where.order.status).toBeUndefined();
  });

  it('차감은 확정 뒤에 돈이 돌아간 줄만 — 줄이 스스로 기억한다', async () => {
    /*
     * 예전에는 "환불 상태 주문 + 확정된 적 있음" 이었다. 한 줄만 반품한 구매확정 주문은 환불
     * 상태가 아니라서 차감에서 빠졌다.
     */
    await previewSettlements(admin, '2026-08');
    const where = db.orderItem.groupBy.mock.calls[1]?.[0].where;
    expect(where.refundedAfterConfirm).toBe(true);
    expect(where.canceledAt.gte.toISOString()).toBe('2026-07-31T15:00:00.000Z');
    expect(where.order, '주문 상태로 가르면 일부 반품이 빠진다').toBeUndefined();
  });

  it('판매에서 빼는 것은 확정 전에 돌아간 줄뿐이다', async () => {
    /*
     * 출고 전 일부 취소는 판 적이 없다. 확정 뒤 반품은 이 달에 판 것이 맞다 — 빼면 이미 지급한
     * 달의 판매가 줄고, 차감은 영영 안 된다. 같은 돈을 더하고 빼지도, 한쪽만 하지도 않는다.
     */
    await previewSettlements(admin, '2026-08');
    const sale = db.orderItem.groupBy.mock.calls[0]?.[0].where;
    expect(sale.OR).toEqual([{ canceledAt: null }, { refundedAfterConfirm: true }]);
  });

  it('가맹점은 자기 것만 본다', async () => {
    await previewSettlements(merchant, '2026-08');
    expect(db.merchant.findMany.mock.calls[0]?.[0].where).toEqual({ id: 'm-a' });
  });

  it('고객은 볼 수 없다', async () => {
    await expect(previewSettlements(customer, '2026-08')).rejects.toThrow();
  });

  it('이미 확정된 기간이면 그 상태를 함께 준다', async () => {
    db.settlement.findMany.mockResolvedValue([{ merchantId: 'm-a', status: 'PAID' }]);
    const drafts = await previewSettlements(admin, '2026-08');
    expect(drafts[0]?.existingStatus).toBe('PAID');
    expect(drafts[1]?.existingStatus).toBeNull();
  });
});

describe('기간 확정', () => {
  it('가맹점은 확정할 수 없다', async () => {
    await expect(closeSettlements(merchant, '2026-08', AFTER)).rejects.toThrow();
    expect(db.settlement.upsert).not.toHaveBeenCalled();
  });

  it('진행 중인 기간은 확정할 수 없다 — 매출이 잘린다', async () => {
    await expect(closeSettlements(admin, '2026-08', DURING)).rejects.toMatchObject({
      code: 'PERIOD_NOT_CLOSED', status: 409,
    });
    expect(db.settlement.upsert).not.toHaveBeenCalled();
  });

  it('끝난 기간을 가맹점 수만큼 기록한다', async () => {
    const result = await closeSettlements(admin, '2026-08', AFTER);
    expect(db.settlement.upsert).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ created: 2, updated: 0, skipped: [] });
  });

  it('같은 가맹점·기간은 유니크 키로 덮어쓴다 — 두 번 돌아도 행이 늘지 않는다', async () => {
    await closeSettlements(admin, '2026-08', AFTER);
    const args = db.settlement.upsert.mock.calls[0]?.[0];
    expect(args.where.merchantId_periodStart_periodEnd.merchantId).toBe('m-a');
    expect(args.create.grossAmount).toBe(1_000_000);
    expect(args.update.status).toBe('CONFIRMED');
  });

  it('이미 확정된 것은 다시 계산하지 않는다', async () => {
    db.settlement.findMany.mockResolvedValue([{ merchantId: 'm-a', status: 'CONFIRMED' }]);
    const result = await closeSettlements(admin, '2026-08', AFTER);
    expect(result.skipped).toEqual(['무어']);
    expect(db.settlement.upsert).toHaveBeenCalledTimes(1);
  });

  it('지급된 것은 절대 건드리지 않는다', async () => {
    db.settlement.findMany.mockResolvedValue([
      { merchantId: 'm-a', status: 'PAID' }, { merchantId: 'm-b', status: 'PAID' },
    ]);
    const result = await closeSettlements(admin, '2026-08', AFTER);
    expect(db.settlement.upsert).not.toHaveBeenCalled();
    expect(result.skipped).toHaveLength(2);
  });

  it('보류(HELD)는 다시 계산한다', async () => {
    db.settlement.findMany.mockResolvedValue([{ merchantId: 'm-a', status: 'HELD' }]);
    const result = await closeSettlements(admin, '2026-08', AFTER);
    expect(result).toMatchObject({ created: 1, updated: 1, skipped: [] });
  });

  it('확정은 가맹점 범위를 무시하고 전체를 본다', async () => {
    // 관리자에게 merchantId 가 붙어 있어도 플랫폼 전체를 정산한다
    await closeSettlements({ ...admin, merchantId: 'm-a' }, '2026-08', AFTER);
    expect(db.merchant.findMany.mock.calls[0]?.[0].where).toEqual({});
  });

  it('형식이 틀린 기간은 거절한다', async () => {
    await expect(closeSettlements(admin, '2026-13', AFTER)).rejects.toThrow();
  });
});

describe('지급 집행', () => {
  beforeEach(() => {
    db.settlement.findUnique.mockResolvedValue({
      id: 's-1', status: 'CONFIRMED', netAmount: 750_000, merchant: { name: '무어' },
    });
    db.settlement.updateMany.mockResolvedValue({ count: 1 });
  });

  it('관리자에게는 settlement:pay 가 없다 — 확정과 지급을 나눠 뒀다', async () => {
    await expect(paySettlement(admin, 's-1')).rejects.toThrow();
    expect(db.settlement.updateMany).not.toHaveBeenCalled();
  });

  it('슈퍼관리자는 지급할 수 있다', async () => {
    await expect(paySettlement(superAdmin, 's-1')).resolves.toMatchObject({ status: 'PAID' });
  });

  it('확정되지 않은 정산은 지급할 수 없다', async () => {
    db.settlement.findUnique.mockResolvedValue({
      id: 's-1', status: 'PENDING', netAmount: 1000, merchant: { name: '무어' },
    });
    await expect(paySettlement(superAdmin, 's-1')).rejects.toMatchObject({ code: 'NOT_CONFIRMED' });
  });

  it('이미 지급된 것은 두 번 나가지 않는다', async () => {
    db.settlement.findUnique.mockResolvedValue({
      id: 's-1', status: 'PAID', netAmount: 1000, merchant: { name: '무어' },
    });
    await expect(paySettlement(superAdmin, 's-1')).rejects.toMatchObject({ code: 'ALREADY_PAID' });
  });

  it('동시에 두 번 눌러도 한 번만 나간다', async () => {
    // 조건부 UPDATE 가 0행을 고치면 다른 요청이 먼저 지급한 것이다
    db.settlement.updateMany.mockResolvedValue({ count: 0 });
    await expect(paySettlement(superAdmin, 's-1')).rejects.toMatchObject({ code: 'ALREADY_PAID' });
    expect(db.settlement.updateMany.mock.calls[0]?.[0].where.status).toBe('CONFIRMED');
  });

  it('지급액이 음수면 자동 집행하지 않는다', async () => {
    db.settlement.findUnique.mockResolvedValue({
      id: 's-1', status: 'CONFIRMED', netAmount: -50_000, merchant: { name: '무어' },
    });
    await expect(paySettlement(superAdmin, 's-1')).rejects.toMatchObject({
      code: 'NEGATIVE_AMOUNT',
    });
  });

  it('없는 정산은 404', async () => {
    db.settlement.findUnique.mockResolvedValue(null);
    await expect(paySettlement(superAdmin, 's-x')).rejects.toMatchObject({ status: 404 });
  });
});
