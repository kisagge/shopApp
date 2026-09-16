import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

const db = vi.hoisted(() => ({
  order: { aggregate: vi.fn<(...a: any[]) => any>(), count: vi.fn<(...a: any[]) => any>(), findMany: vi.fn<(...a: any[]) => any>() },
  orderItem: { aggregate: vi.fn<(...a: any[]) => any>(), groupBy: vi.fn<(...a: any[]) => any>() },
  orderRefund: { aggregate: vi.fn<(...a: any[]) => any>() },
  product: { count: vi.fn<(...a: any[]) => any>() },
  eventLog: { groupBy: vi.fn<(...a: any[]) => any>() },
  $queryRaw: vi.fn<(...a: any[]) => any>(),
}));
vi.mock('@shop/db', () => ({ prisma: db, Prisma: { sql: (s: unknown) => s, join: (s: unknown) => s, raw: (s: unknown) => s } }));

const { getDashboard } = await import('~/lib/queries/admin/dashboard');

const admin: Actor = { id: 'u-a', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };

const NOW = new Date('2026-09-09T00:00:00Z');

beforeEach(() => {
  vi.clearAllMocks();
  // 1) 판 것 2) 가맹점 판 것 3) 되돌아간 것(환불 기록) 4) 가맹점 되돌아간 것(줄)
  // 이번 기간 값이 먼저, 그다음 지난 기간(같은 함수로 한 번 더 센다)
  db.order.aggregate
    .mockResolvedValueOnce({ _count: { _all: 40 }, _sum: { payable: 1_000_000 } })
    .mockResolvedValue({ _count: { _all: 20 }, _sum: { payable: 400_000 } });
  db.orderRefund.aggregate.mockResolvedValueOnce({ _sum: { amount: 120_000 } }).mockResolvedValue({ _sum: { amount: 0 } });
  db.orderItem.aggregate
    .mockResolvedValueOnce({ _sum: { subtotal: 500_000 } })
    .mockResolvedValueOnce({ _sum: { subtotal: 40_000 } })
    .mockResolvedValue({ _sum: { subtotal: 0 } });
  db.order.count.mockResolvedValue(0);
  db.product.count.mockResolvedValue(0);
  db.order.findMany.mockResolvedValue([]);
  db.orderItem.groupBy.mockResolvedValue([]);
  db.eventLog.groupBy.mockResolvedValue([]);
  db.$queryRaw.mockResolvedValue([]);
});

/**
 * 예전에는 `placedAt` 으로 묶고 **지금 상태**로 걸렀다. 그래서 오늘 들어온
 * 반품 접수 하나가 그 주문을 산 날의 매출을 깎았고, 접수를 철회하면 도로
 * 늘었다. 어제 본 숫자와 오늘 본 숫자가 다르면 그 숫자로는 아무 결정도 할 수
 * 없다.
 */
describe('매출은 돈이 오간 시각에 잡는다', () => {
  it('판 금액은 결제 시각으로 센다 — 지금 상태로 거르지 않는다', async () => {
    await getDashboard(admin, '7d', NOW);
    const where = db.order.aggregate.mock.calls[0]?.[0].where;

    expect(where.paidAt, '결제 시각으로 걸러야 한다').toBeDefined();
    expect(
      where.status,
      '상태로 거르면 나중에 상태가 바뀔 때 지나간 날의 숫자가 달라진다',
    ).toBeUndefined();
    expect(where.placedAt, '주문한 시각이 아니라 결제한 시각이다').toBeUndefined();
  });

  it('환불은 환불 기록의 시각에 뺀다 — 판 날로 소급하지 않는다', async () => {
    /*
     * 예전에는 "환불 상태인 주문의 결제액" 이었다. 일부만 취소한 주문은 결제완료인 채로
     * 남아서 **나간 돈이 어디서도 안 빠졌다.** 환불 기록의 합으로 뺀다.
     */
    await getDashboard(admin, '7d', NOW);
    const where = db.orderRefund.aggregate.mock.calls[0]?.[0].where;
    expect(where.createdAt).toEqual({ gte: expect.any(Date), lt: expect.any(Date) });
    // 이번·지난 기간 한 번씩 — 환불을 세려고 주문을 따로 집계하지 않는다
    expect(db.order.aggregate, '주문 상태로 환불을 세면 부분 취소가 빠진다').toHaveBeenCalledTimes(2);
  });

  it('가맹점 환불은 자기 줄의 취소 시각으로, 결제된 주문만 뺀다', async () => {
    await getDashboard(merchant, '7d', NOW);
    const where = db.orderItem.aggregate.mock.calls[1]?.[0].where;
    expect(where.merchantId).toBe('m-a');
    expect(where.canceledAt).toEqual({ gte: expect.any(Date), lt: expect.any(Date) });
    expect(where.order.paidAt, '결제된 적 없는 주문은 되돌릴 돈도 없다').toEqual({ not: null });
  });

  it('반품 접수는 어느 쪽에도 잡히지 않는다 — 돈이 오간 사건이 아니다', async () => {
    await getDashboard(admin, '7d', NOW);
    const shapes = db.order.aggregate.mock.calls.map((c) => JSON.stringify(c[0].where));

    for (const shape of shapes) {
      expect(shape, '반품 접수가 매출 질의에 등장하면 접수만으로 숫자가 흔들린다')
        .not.toContain('RETURN_REQUESTED');
    }
  });

  it('총매출 · 환불 · 순매출을 함께 준다', async () => {
    const d = await getDashboard(admin, '7d', NOW);
    expect(d.period.revenue).toBe(1_000_000);
    expect(d.period.refunded).toBe(120_000);
    expect(d.period.netRevenue).toBe(880_000);
  });

  it('가맹점은 자기 줄만 더하고 뺀다', async () => {
    const d = await getDashboard(merchant, '7d', NOW);
    expect(d.period.revenue).toBe(500_000);
    expect(d.period.refunded).toBe(40_000);
    expect(d.period.netRevenue).toBe(460_000);
  });
});

describe('기간과 지난 기간', () => {
  const kst = (iso: string) => new Date(`${iso}+09:00`);

  it('이번 기간은 끝을 포함하지 않는 창으로, 지난 기간은 같은 함수로 바로 앞 창을 센다', async () => {
    // NOW = KST 2026-09-09 09:00 → 7일: 9/3 00:00 ~ 9/10 00:00, 지난 기간: 8/27 00:00 ~ 9/2 09:00(같은 시각까지)
    await getDashboard(admin, '7d', NOW);
    const [current, previous] = db.order.aggregate.mock.calls.map((c) => c[0].where.paidAt);
    expect(current).toEqual({ gte: kst('2026-09-03T00:00:00'), lt: kst('2026-09-10T00:00:00') });
    expect(previous).toEqual({ gte: kst('2026-08-27T00:00:00'), lt: kst('2026-09-02T09:00:00') });
  });

  it('지난 기간 지표를 함께 준다 — 비교는 화면이 같은 함수(compareValues)로', async () => {
    const d = await getDashboard(admin, '7d', NOW);
    expect(d.previous).toMatchObject({ revenue: 400_000, refunded: 0, netRevenue: 400_000, orderCount: 20, averageOrderValue: 20_000 });
    expect(d.previous.from).toEqual(kst('2026-08-27T00:00:00'));
  });

  it('지난 기간에 조회가 없었으면 전환율은 없다(null) — 0% 로 적으면 "아무도 안 샀다" 로 읽힌다', async () => {
    const d = await getDashboard(admin, '7d', NOW);
    expect(d.previous.conversionRate).toBeNull();
  });

  it('직접 고른 기간을 그대로 쓰고, 탭 값이 없다', async () => {
    const { customPeriod } = await import('@shop/core');
    const r = customPeriod('2026-09-01', '2026-09-05', NOW);
    if (!r.ok) throw new Error(r.message);
    const d = await getDashboard(admin, r.period, NOW);
    expect(d.range).toBeNull();
    expect(d.rangeLabel).toBe('5일');
    expect(db.order.aggregate.mock.calls[0]![0].where.paidAt).toEqual({ gte: kst('2026-09-01T00:00:00'), lt: kst('2026-09-06T00:00:00') });
    // 지난 날로만 된 기간은 온전한 앞 5일과 견준다
    expect(db.order.aggregate.mock.calls[1]![0].where.paidAt).toEqual({ gte: kst('2026-08-27T00:00:00'), lt: kst('2026-09-01T00:00:00') });
  });
});
