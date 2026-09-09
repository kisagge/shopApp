import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

const db = vi.hoisted(() => ({
  order: { aggregate: vi.fn<(...a: any[]) => any>(), count: vi.fn<(...a: any[]) => any>(), findMany: vi.fn<(...a: any[]) => any>() },
  orderItem: { aggregate: vi.fn<(...a: any[]) => any>(), groupBy: vi.fn<(...a: any[]) => any>() },
  productVariant: { count: vi.fn<(...a: any[]) => any>() },
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
  // 1) 판 것 2) 가맹점 판 것 3) 되돌아간 것 4) 가맹점 되돌아간 것
  db.order.aggregate
    .mockResolvedValueOnce({ _count: { _all: 40 }, _sum: { payable: 1_000_000 } })
    .mockResolvedValueOnce({ _sum: { payable: 120_000 } });
  db.orderItem.aggregate
    .mockResolvedValueOnce({ _sum: { subtotal: 500_000 } })
    .mockResolvedValueOnce({ _sum: { subtotal: 40_000 } });
  db.order.count.mockResolvedValue(0);
  db.productVariant.count.mockResolvedValue(0);
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

  it('환불은 환불 시각에 뺀다 — 판 날로 소급하지 않는다', async () => {
    await getDashboard(admin, '7d', NOW);
    const where = db.order.aggregate.mock.calls[1]?.[0].where;

    expect(where.canceledAt).toBeDefined();
    expect(where.status.in).toEqual(['CANCELLED', 'REFUNDED']);
    expect(where.paidAt, '결제된 적 없는 주문은 되돌릴 돈도 없다').toEqual({ not: null });
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
