import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LOW_STOCK_THRESHOLD, type Actor } from '@shop/core';

/**
 * 대시보드의 품절·임박 숫자와, 그것을 눌러 도착하는 상품 목록.
 *
 * 세 가지가 어긋나 있었다.
 *  · 대시보드는 `재고 ≤ 5` 로 세어 **이미 품절된 옵션까지** "품절 임박" 이라 불렀고,
 *    목록의 "임박" 은 `0 < 재고 ≤ 5` 였다 — 같은 이름으로 다른 수
 *  · 대시보드는 **옵션**을 세고 **필터 없는 상품 목록**으로 보냈다 — 도착한 곳에서
 *    그 숫자를 찾을 수 없었다
 *  · 보관한 상품·작성 중인 상품의 품절까지 할 일로 셌다
 *
 * 이제 둘이 stockAttentionWhere 하나를 쓴다. 여기서는 **같은 조건인가** 를 본다.
 */

const db = vi.hoisted(() => ({
  order: {
    aggregate: vi.fn<(...a: any[]) => any>(),
    count: vi.fn<(...a: any[]) => any>(),
    findMany: vi.fn<(...a: any[]) => any>(),
  },
  orderItem: { aggregate: vi.fn<(...a: any[]) => any>(), groupBy: vi.fn<(...a: any[]) => any>() },
  orderRefund: { aggregate: vi.fn<(...a: any[]) => any>() },
  product: { count: vi.fn<(...a: any[]) => any>(), findMany: vi.fn<(...a: any[]) => any>() },
  payment: { count: vi.fn<(...a: any[]) => any>() },
  eventLog: { groupBy: vi.fn<(...a: any[]) => any>() },
  $queryRaw: vi.fn<(...a: any[]) => any>(),
}));
vi.mock('@shop/db', () => ({
  prisma: db,
  Prisma: { sql: (s: unknown) => s, join: (s: unknown) => s, raw: (s: unknown) => s },
}));

const { getDashboard } = await import('~/lib/queries/admin/dashboard');
const { getAdminProducts, stockAttentionWhere } = await import('~/lib/queries/admin/products');

const admin: Actor = { id: 'u-a', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };

beforeEach(() => {
  vi.clearAllMocks();
  db.order.aggregate.mockResolvedValue({ _count: { _all: 0 }, _sum: { payable: 0 } });
  db.orderRefund.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
  db.orderItem.aggregate.mockResolvedValue({ _sum: { subtotal: 0 } });
  db.orderItem.groupBy.mockResolvedValue([]);
  db.order.count.mockResolvedValue(0);
  db.order.findMany.mockResolvedValue([]);
  db.eventLog.groupBy.mockResolvedValue([]);
  db.$queryRaw.mockResolvedValue([]);
  db.product.count.mockResolvedValue(0);
  db.payment.count.mockResolvedValue(0);
  db.product.findMany.mockResolvedValue([]);
});

/** product.count 에 넘어간 조건 중 재고로 거른 것들 */
const stockCountWheres = () =>
  db.product.count.mock.calls
    .map((c) => c[0].where)
    .filter((w) => w.variants?.some?.stock !== undefined);

describe('조건', () => {
  it('품절은 재고 0, 임박은 1 부터 기준까지 — 품절을 임박에 섞지 않는다', () => {
    expect(stockAttentionWhere('OUT', null).variants.some.stock).toEqual({ lte: 0 });
    expect(stockAttentionWhere('LOW', null).variants.some.stock).toEqual({
      gt: 0, lte: LOW_STOCK_THRESHOLD,
    });
  });

  it('판매 중인 옵션만 본다 — 팔지 않는 것의 재고는 급하지 않다', () => {
    expect(stockAttentionWhere('OUT', null).variants.some.isActive).toBe(true);
  });

  it('매대에 오른 상품만 — 작성 중·숨긴 상품의 품절은 할 일이 아니다', () => {
    expect(stockAttentionWhere('OUT', null).status).toEqual({ in: ['ACTIVE', 'SOLD_OUT'] });
  });

  it('보관한 상품은 뺀다', () => {
    expect(stockAttentionWhere('LOW', null).deletedAt).toBeNull();
  });

  it('가맹점은 자기 브랜드만', () => {
    expect(stockAttentionWhere('OUT', 'm-a').brand).toEqual({ merchantId: 'm-a' });
    expect(stockAttentionWhere('OUT', null).brand).toBeUndefined();
  });
});

describe('대시보드의 숫자', () => {
  it('옵션이 아니라 상품을 센다 — 도착하는 목록이 상품 목록이다', async () => {
    await getDashboard(admin, '7d', new Date('2026-09-09T00:00:00Z'));

    expect(stockCountWheres()).toEqual([
      stockAttentionWhere('OUT', null),
      stockAttentionWhere('LOW', null),
    ]);
  });

  it('품절과 임박을 따로 준다', async () => {
    db.product.count.mockImplementation(async ({ where }: any) => {
      const stock = where.variants?.some?.stock;
      if (stock?.lte === 0) return 3;
      if (stock?.gt === 0) return 7;
      return 0;
    });

    const d = await getDashboard(admin, '7d', new Date('2026-09-09T00:00:00Z'));

    expect(d.todo).toMatchObject({ outOfStock: 3, lowStock: 7 });
  });

  it('가맹점 대시보드는 자기 브랜드만 센다', async () => {
    await getDashboard(merchant, '7d', new Date('2026-09-09T00:00:00Z'));

    expect(stockCountWheres()).toEqual([
      stockAttentionWhere('OUT', 'm-a'),
      stockAttentionWhere('LOW', 'm-a'),
    ]);
  });
});

describe('눌러서 도착하는 목록', () => {
  it('품절 탭은 대시보드와 같은 조건으로 거른다', async () => {
    await getAdminProducts(admin, { stock: 'OUT' });

    expect(db.product.findMany.mock.calls[0]![0].where).toEqual(stockAttentionWhere('OUT', null));
  });

  it('임박 탭도 마찬가지다', async () => {
    await getAdminProducts(merchant, { stock: 'LOW' });

    expect(db.product.findMany.mock.calls[0]![0].where).toEqual(stockAttentionWhere('LOW', 'm-a'));
  });

  it('탭에 붙는 숫자도 같은 조건이다 — 대시보드와 탭이 다른 수를 말하지 않는다', async () => {
    db.product.count.mockImplementation(async ({ where }: any) => {
      const stock = where.variants?.some?.stock;
      if (stock?.lte === 0) return 3;
      if (stock?.gt === 0) return 7;
      return 0;
    });

    const result = await getAdminProducts(admin, {});

    expect(result).toMatchObject({ outOfStockCount: 3, lowStockCount: 7 });
  });

  it('필터가 없으면 재고로 거르지 않는다', async () => {
    await getAdminProducts(admin, {});

    expect(db.product.findMany.mock.calls[0]![0].where.variants).toBeUndefined();
  });
});

describe('취소 뒤 들어온 입금', () => {
  it('운영진 대시보드는 목록 필터와 같은 조건으로 센다', async () => {
    const { LATE_DEPOSIT_OPEN } = await import('~/lib/queries/admin/orders');
    db.payment.count.mockResolvedValue(2);

    const d = await getDashboard(admin, '7d', new Date('2026-09-09T00:00:00Z'));

    expect(d.todo.lateDeposits).toBe(2);
    expect(db.payment.count).toHaveBeenCalledWith({ where: LATE_DEPOSIT_OPEN });
  });

  it('가맹점 대시보드는 세지 않는다 — 받은 돈은 플랫폼 계좌에 있다', async () => {
    const d = await getDashboard(merchant, '7d', new Date('2026-09-09T00:00:00Z'));

    expect(d.todo.lateDeposits).toBe(0);
    expect(db.payment.count).not.toHaveBeenCalled();
  });
});
