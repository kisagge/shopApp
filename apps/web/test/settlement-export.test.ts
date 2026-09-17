import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

/**
 * 정산 내역 내려받기.
 *
 * 이 파일이 지키는 것은 **화면의 정산과 같은 숫자인가**다. 줄을 고르는 조건이 초안과 하나인지, 합계를
 * 같은 계산으로 내는지, 가맹점은 무엇을 보내도 자기 것만 받는지.
 */

const db = vi.hoisted(() => ({
  merchant: { findMany: vi.fn<(...a: any[]) => any>() },
  orderItem: { count: vi.fn<(...a: any[]) => any>(), findMany: vi.fn<(...a: any[]) => any>() },
  // 확정된 기간은 그때 얼린 요율로 적는다 — 가맹점의 지금 요율이 아니다
  settlement: { findMany: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db }));

/** 넘어올 빚은 초안이 센다 — 여기서는 그 결과만 흉내 낸다(줄 조건은 진짜를 쓴다) */
const previewSettlements = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/admin/close-settlement', async (orig) => ({
  ...(await orig<typeof import('~/lib/admin/close-settlement')>()),
  previewSettlements,
}));

const { exportSettlementLines, SettlementExportTooLargeError, SETTLEMENT_EXPORT_MAX_ROWS } =
  await import('~/lib/admin/settlement-export');
const { settlementSaleWhere, settlementDeductionWhere } = await import('~/lib/admin/close-settlement');

const admin: Actor = { id: 'u-a', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };
const customer: Actor = { id: 'u-c', role: 'CUSTOMER', merchantId: null };

const line = (orderNo: string, subtotal: number, over: Record<string, unknown> = {}) => ({
  merchantId: 'm-a', productName: '울 코트', optionLabel: '오트 / M', quantity: 1, subtotal,
  canceledAt: null, order: { orderNo, confirmedAt: new Date('2026-08-10T01:00:00Z') }, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.merchant.findMany.mockResolvedValue([{ id: 'm-a', name: '무어', commissionPercent: 15 }]);
  // 아직 확정하지 않은 기간 — 그때는 가맹점의 지금 요율이 곧 확정될 요율이다
  db.settlement.findMany.mockResolvedValue([]);
  previewSettlements.mockResolvedValue([]);
  db.orderItem.count.mockResolvedValue(3);
  db.orderItem.findMany
    .mockResolvedValueOnce([line('20260810-0000001', 100_000), line('20260811-0000002', 33_333)])
    .mockResolvedValueOnce([line('20260701-0000009', 20_000, { canceledAt: new Date('2026-08-20T15:30:00Z') })]);
});

describe('줄', () => {
  it('판매 줄과 차감 줄을 한 줄씩, 차감은 음수로, 한국 시각으로 준다', async () => {
    const rows = await exportSettlementLines(admin, '2026-08');
    expect(rows[0]).toEqual(['판매', '무어', '20260810-0000001', '2026-08-10 10:00', '울 코트', '오트 / M', 1, 100_000]);
    expect(rows[2]).toEqual(['차감(확정 뒤 반품)', '무어', '20260701-0000009', '2026-08-21 00:30', '울 코트', '오트 / M', 1, -20_000]);
  });

  it('줄을 고르는 조건이 정산 초안과 같다 — 따로 적으면 파일의 합이 화면과 어긋난다', async () => {
    await exportSettlementLines(admin, '2026-08');
    const period = { start: new Date('2026-07-31T15:00:00Z'), end: new Date('2026-08-31T15:00:00Z') };
    expect(db.orderItem.findMany.mock.calls[0]![0].where).toEqual(settlementSaleWhere(period));
    expect(db.orderItem.findMany.mock.calls[1]![0].where).toEqual(settlementDeductionWhere(period));
  });
});

describe('합계', () => {
  it('가맹점마다 판매·수수료·차감·지급액을 정산과 같은 계산으로 붙인다', async () => {
    const rows = await exportSettlementLines(admin, '2026-08');
    const totals = rows.filter((r) => String(r[0]).startsWith('합계'));
    // 판매 133,333 · 수수료 15% 는 버림 19,999 · 차감 20,000 → 93,334
    expect(totals).toEqual([
      ['합계 · 판매', '무어', '', '', '', '', '', 133_333],
      ['합계 · 수수료 15%', '무어', '', '', '', '', '', -19_999],
      ['합계 · 차감', '무어', '', '', '', '', '', -20_000],
      ['합계 · 지급액', '무어', '', '', '', '', '', 93_334],
    ]);
  });

  it('줄이 없는 가맹점은 합계도 없다', async () => {
    db.orderItem.findMany.mockReset().mockResolvedValue([]);
    db.orderItem.count.mockResolvedValue(0);
    expect(await exportSettlementLines(admin, '2026-08')).toEqual([]);
  });
});

describe('범위', () => {
  it('가맹점은 다른 가맹점을 달라고 보내도 자기 것만 받는다', async () => {
    await exportSettlementLines(merchant, '2026-08', 'm-other');
    expect(db.merchant.findMany.mock.calls[0]![0].where).toEqual({ id: 'm-a' });
    expect(db.orderItem.findMany.mock.calls[0]![0].where.merchantId).toBe('m-a');
  });

  it('운영진은 가맹점 하나만 골라 받을 수 있다', async () => {
    await exportSettlementLines(admin, '2026-08', 'm-b');
    expect(db.orderItem.findMany.mock.calls[0]![0].where.merchantId).toBe('m-b');
  });

  it('정산을 볼 권한이 없으면 읽지 않는다', async () => {
    await expect(exportSettlementLines(customer, '2026-08')).rejects.toThrow();
    expect(db.orderItem.findMany).not.toHaveBeenCalled();
  });

  it('한도를 넘으면 읽기 전에 멈추고 가맹점을 골라 받으라고 말한다', async () => {
    db.orderItem.count.mockResolvedValue(SETTLEMENT_EXPORT_MAX_ROWS);
    const error = await exportSettlementLines(admin, '2026-08').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SettlementExportTooLargeError);
    expect((error as Error).message).toContain('가맹점을 골라');
    expect(db.orderItem.findMany).not.toHaveBeenCalled();
  });

  it('틀린 기간은 거절한다', async () => {
    await expect(exportSettlementLines(admin, '2026-13')).rejects.toThrow();
  });
});

describe('확정된 기간의 요율', () => {
  it('얼려 둔 요율로 적는다 — 가맹점의 지금 요율이 아니다', async () => {
    /*
     * 요율을 바꾼 뒤 지난달 파일을 받았을 때 확정된 정산 행과 수수료가 어긋나면, 둘 다 우리가 준 숫자인데
     * 가맹점은 어느 쪽도 믿을 수 없다.
     */
    db.settlement.findMany.mockResolvedValue([{ merchantId: 'm-a', commissionPercent: 10 }]);

    const rows = await exportSettlementLines(admin, '2026-08');
    const commission = rows.find((r) => String(r[0]).startsWith('합계 · 수수료'));

    expect(commission?.[0]).toBe('합계 · 수수료 10%');
    // 133,333 의 10% 는 13,333 (버림)
    expect(commission?.[7]).toBe(-13_333);
  });

  it('확정 전이면 지금 요율로 적는다 — 확정될 때의 요율이 그것이다', async () => {
    const rows = await exportSettlementLines(admin, '2026-08');
    expect(rows.find((r) => String(r[0]).startsWith('합계 · 수수료'))?.[0]).toBe('합계 · 수수료 15%');
  });
});

/**
 * **앞선 달에서 넘어온 빚도 파일에 적는다.** 화면의 지급액은 그것을 뺀 금액이라, 파일에 없으면 합이 어긋난다.
 */
describe('앞선 달 이월', () => {
  it('넘어온 빚을 한 줄로 적고 지급액에서 뺀다 — 초안과 같은 숫자다', async () => {
    previewSettlements.mockResolvedValue([{ merchantId: 'm-a', carriedAmount: -40_000 }]);

    const rows = await exportSettlementLines(admin, '2026-08');

    const byLabel = new Map(rows.filter((r) => String(r[0]).startsWith('합계')).map((r) => [r[0], r[7]]));
    expect(byLabel.get('합계 · 앞선 달 이월')).toBe(-40_000);
    // 133,333 판매, 수수료 15% 19,999, 차감 20,000, 이월 40,000
    expect(byLabel.get('합계 · 지급액')).toBe(133_333 - 19_999 - 20_000 - 40_000);
  });

  it('넘어온 빚이 없으면 그 줄을 두지 않는다', async () => {
    const rows = await exportSettlementLines(admin, '2026-08');
    expect(rows.some((r) => r[0] === '합계 · 앞선 달 이월')).toBe(false);
  });

  it('판매가 없어도 넘어온 빚이 있으면 합계를 적는다 — 화면에는 그 가맹점의 음수가 뜬다', async () => {
    db.orderItem.findMany.mockReset().mockResolvedValue([]);
    previewSettlements.mockResolvedValue([{ merchantId: 'm-a', carriedAmount: -5_000 }]);

    const rows = await exportSettlementLines(admin, '2026-08');

    expect(rows.find((r) => r[0] === '합계 · 지급액')?.[7]).toBe(-5_000);
  });

  it('가맹점 계정은 자기 범위로 초안을 센다', async () => {
    await exportSettlementLines(merchant, '2026-08', 'm-other');
    expect(previewSettlements.mock.calls[0]![0]).toMatchObject({ merchantId: 'm-a' });
  });
});
