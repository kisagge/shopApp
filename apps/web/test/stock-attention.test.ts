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
  // 반품지 없이 파는 곳을 세는 조회
  merchant: { count: vi.fn<(...a: any[]) => any>(), findUnique: vi.fn<(...a: any[]) => any>() },
  returnAddress: { findUnique: vi.fn<(...a: any[]) => any>() },
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
  db.merchant.count.mockResolvedValue(0);
  // 가맹점이 자기 대시보드를 볼 때 "아직 못 하는 일" 을 묻는다 — 기본은 둘 다 등록된 가게다
  db.merchant.findUnique.mockResolvedValue({ settlementAccount: '00100000000001', returnAddress: { id: 'ra-1' } });
  db.returnAddress.findUnique.mockResolvedValue({ id: 'platform' });
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

/**
 * **반품지 없이 팔고 있는 곳.**
 *
 * 이제 반품지가 없으면 매대에 올릴 수 없지만(assertReturnAddress), 그 문이 생기기 전에 올라간 상품은
 * 그대로 서 있다 — 그 가게의 물건은 돌아올 곳이 없다. 가맹점 목록에 "미등록" 뱃지는 붙어 있었어도
 * **지금 파는 곳인지**는 거기서 알 수 없었다.
 */
describe('반품지 없이 파는 판매처', () => {
  const NOW = new Date('2026-09-09T00:00:00Z');
  const asked = () => db.merchant.count.mock.calls[0]![0].where as Record<string, any>;

  it('파는 곳만 센다 — 팔지 않는 가맹점의 미등록은 급한 일이 아니다', async () => {
    db.merchant.count.mockResolvedValue(2);

    const d = await getDashboard(admin, '7d', NOW);

    expect(d.todo.noReturnAddress).toBe(2);
    expect(asked()['returnAddress']).toEqual({ is: null });
    // 매대의 조건은 스토어프론트와 같은 것을 쓴다 — 손님에게 보이는데 숫자에는 없으면 안 된다
    expect(asked()['brands'].some.products.some).toMatchObject({
      deletedAt: null, publishedAt: { not: null },
    });
  });

  /** 정지·해지된 가맹점의 상품은 매대에서 내려간다 — 지금 파는 곳만 센다 */
  it('승인된 가맹점만 본다', async () => {
    await getDashboard(admin, '7d', NOW);

    expect(asked()['status']).toBe('APPROVED');
  });

  it('가맹점 대시보드는 자기 가게 하나만 본다', async () => {
    db.merchant.count.mockResolvedValue(1);

    const d = await getDashboard(merchant, '7d', NOW);

    expect(asked()['id']).toBe('m-a');
    expect(asked()['status']).toBeUndefined();
    expect(d.todo.noReturnAddress).toBe(1);
  });

  /** 자사 상품도 돌아올 곳이 있어야 한다 — 플랫폼 반품지도 한 줄이라 한 곳으로 센다 */
  it('자사 상품을 파는데 플랫폼 반품지가 없으면 한 곳을 더한다', async () => {
    db.returnAddress.findUnique.mockResolvedValue(null);
    db.product.count.mockResolvedValue(4);

    const d = await getDashboard(admin, '7d', NOW);

    expect(d.todo.noReturnAddress).toBe(1);
  });

  it('플랫폼 반품지가 있으면 자사는 묻지 않는다', async () => {
    const d = await getDashboard(admin, '7d', NOW);

    expect(d.todo.noReturnAddress).toBe(0);
  });

  it('가맹점은 플랫폼 반품지를 보지 않는다 — 자기 가게와 상관이 없다', async () => {
    db.returnAddress.findUnique.mockResolvedValue(null);

    await getDashboard(merchant, '7d', NOW);

    expect(db.returnAddress.findUnique).not.toHaveBeenCalled();
  });
});

/**
 * 가맹점이 **아직 못 하는 일** — 등록하지 않아 막혀 있는 것.
 *
 * 둘 다 "없으면 막는다" 는 자리다: 반품지가 없으면 상품을 매대에 올릴 수 없고, 정산 계좌가 없으면
 * 지급을 할 수 없다. 운영진 화면에서는 세지 않는다 — 남의 가게의 빈칸은 가맹점 목록이 보여 준다.
 */
describe('가맹점이 아직 못 하는 일', () => {
  const NOW = new Date('2026-09-09T00:00:00Z');

  it('자기 가게의 빈칸을 묻는다', async () => {
    db.merchant.findUnique.mockResolvedValue({ settlementAccount: null, returnAddress: null });

    const d = await getDashboard(merchant, '7d', NOW);

    expect(db.merchant.findUnique.mock.calls[0]![0].where).toEqual({ id: 'm-a' });
    expect(d.todo.merchantSetup).toEqual({ returnAddress: true, settlementAccount: true });
  });

  it('등록돼 있으면 막힌 것이 없다', async () => {
    const d = await getDashboard(merchant, '7d', NOW);

    expect(d.todo.merchantSetup).toEqual({ returnAddress: false, settlementAccount: false });
  });

  /** 남의 가게를 여기서 세면 누구의 일인지 알 수 없다 */
  it('운영진은 묻지 않는다', async () => {
    const d = await getDashboard(admin, '7d', NOW);

    expect(d.todo.merchantSetup).toBeNull();
    expect(db.merchant.findUnique).not.toHaveBeenCalled();
  });

  it('없는 가맹점이면 할 말도 없다', async () => {
    db.merchant.findUnique.mockResolvedValue(null);

    const d = await getDashboard(merchant, '7d', NOW);

    expect(d.todo.merchantSetup).toEqual({ returnAddress: false, settlementAccount: false });
  });
});
