import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

const db = vi.hoisted(() => ({
  order: { findMany: vi.fn<(...a: any[]) => any>(), count: vi.fn<(...a: any[]) => any>() },
  product: { findMany: vi.fn<(...a: any[]) => any>(), count: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db, Prisma: {} }));

const { getAdminOrders } = await import('~/lib/queries/admin/orders');
const { getAdminProducts } = await import('~/lib/queries/admin/products');

const admin: Actor = { id: 'u-a', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };

const order = (id: string) => ({
  id, orderNo: `2026-${id}`, status: 'PAID', placedAt: new Date('2026-08-01'),
  payable: 10_000, user: { name: '홍길동' },
  items: [{ productName: '코트', subtotal: 10_000 }],
});

const product = (id: string) => ({
  id, slug: `p-${id}`, name: '코트', listPrice: 100_000, salePrice: null,
  status: 'ACTIVE', createdAt: new Date('2026-08-01'),
  brand: { name: 'MOOR' }, category: { name: '코트' },
  // _count 는 조회가 함께 고르는 값이다 — 빼 두면 실제와 다른 모양을 검사하게 된다
  variants: [{ stock: 3, _count: { restockAlerts: 0 } }],
});

beforeEach(() => {
  vi.clearAllMocks();
  db.order.count.mockResolvedValue(120);
  db.product.count.mockResolvedValue(87);
});

describe('주문 목록 페이지네이션', () => {
  it('total 은 전체 건수다 — 한 쪽 크기가 아니다', async () => {
    db.order.findMany.mockResolvedValue([order('a'), order('b')]);
    const page = await getAdminOrders(admin);
    // 화면 상단의 "N건" 이 25 로 굳으면 안 된다
    expect(page.total).toBe(120);
    expect(page.rows).toHaveLength(2);
  });

  it('한 쪽만큼만 읽는다 — 다음 쪽이 있는지는 전체 수가 말한다', async () => {
    db.order.findMany.mockResolvedValue(['a', 'b', 'c'].map(order));
    const page = await getAdminOrders(admin, { take: 3 });
    expect(db.order.findMany.mock.calls[0]?.[0].take).toBe(3);
    expect(page.rows).toHaveLength(3);
  });

  it('쪽 번호만큼 건너뛴다', async () => {
    db.order.findMany.mockResolvedValue([order('z')]);
    await getAdminOrders(admin, { page: 3, take: 25 });
    expect(db.order.findMany.mock.calls[0]?.[0].skip).toBe(50);
  });

  it('첫 쪽은 건너뛰지 않는다', async () => {
    db.order.findMany.mockResolvedValue([order('a')]);
    await getAdminOrders(admin);
    expect(db.order.findMany.mock.calls[0]?.[0].skip).toBe(0);
  });

  it('정렬은 시각과 id 두 축이다', async () => {
    db.order.findMany.mockResolvedValue([]);
    await getAdminOrders(admin);
    expect(db.order.findMany.mock.calls[0]?.[0].orderBy).toEqual([
      { placedAt: 'desc' }, { id: 'desc' },
    ]);
  });

  it('total 도 같은 조건으로 센다 — 필터를 걸면 숫자도 따라가야 한다', async () => {
    db.order.findMany.mockResolvedValue([]);
    await getAdminOrders(merchant, { status: 'PAID' });
    const listWhere = db.order.findMany.mock.calls[0]?.[0].where;
    const countWhere = db.order.count.mock.calls[0]?.[0].where;
    expect(countWhere).toEqual(listWhere);
    expect(countWhere.items).toEqual({ some: { merchantId: 'm-a' } });
  });

  it('한 쪽 크기에 상한이 있다', async () => {
    db.order.findMany.mockResolvedValue([]);
    await getAdminOrders(admin, { take: 9999 });
    // 한 쪽에 상한만큼만 읽는다 — 커서 시절의 "한 줄 더" 는 없다
    expect(db.order.findMany.mock.calls[0]?.[0].take).toBe(50);
  });
});

describe('상품 목록 페이지네이션', () => {
  it('가맹점 범위가 목록과 개수 모두에 걸린다', async () => {
    db.product.findMany.mockResolvedValue([]);
    await getAdminProducts(merchant);
    expect(db.product.count.mock.calls[0]?.[0].where.brand).toEqual({ merchantId: 'm-a' });
  });

  it('한 쪽만큼 주고 전체 수를 함께 말한다 — 쪽 수가 그 값에서 나온다', async () => {
    db.product.findMany.mockResolvedValue(['a', 'b'].map(product));
    const page = await getAdminProducts(admin, { take: 2 });
    expect(page.rows).toHaveLength(2);
    expect(page.total).toBe(87);
  });

  it('삭제된 상품은 개수에서도 빠진다', async () => {
    db.product.findMany.mockResolvedValue([]);
    await getAdminProducts(admin);
    expect(db.product.count.mock.calls[0]?.[0].where.deletedAt).toBeNull();
  });
});
