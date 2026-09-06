import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

const db = vi.hoisted(() => ({
  product: { findMany: vi.fn<(...a: any[]) => any>().mockResolvedValue([]) },
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const getActor = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/auth/session', () => ({ getActor }));

const { GET } = await import('~/app/api/admin/products/search/route');

const admin: Actor = { id: 'u-a', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };
const customer: Actor = { id: 'u-c', role: 'CUSTOMER', merchantId: null };

const call = (q = '코트') =>
  GET(new Request(`http://localhost/api/admin/products/search?q=${encodeURIComponent(q)}`));

const whereOf = () => db.product.findMany.mock.calls[0]![0].where;

beforeEach(() => {
  vi.clearAllMocks();
  db.product.findMany.mockResolvedValue([]);
  getActor.mockResolvedValue(admin);
});

/**
 * 쿠폰 대상 지정과 기획전 담기가 **같은 창구를 쓴다.** 두 벌로 두었더니
 * 다음 사람이 어느 쪽에 붙일지 헷갈리는 자리가 됐다.
 */
describe('운영 화면의 상품 검색', () => {
  it('로그인하지 않았으면 막는다', async () => {
    getActor.mockResolvedValue(null);
    expect((await call()).status).toBe(403);
  });

  it('고객은 막는다', async () => {
    getActor.mockResolvedValue(customer);
    expect((await call()).status).toBe(403);
    expect(db.product.findMany).not.toHaveBeenCalled();
  });

  it('운영진은 전부 본다', async () => {
    await call();
    expect(whereOf().brand).toBeUndefined();
  });

  it('가맹점은 자기 브랜드만 본다 — 예전 쿠폰용 창구에는 이 범위가 없었다', async () => {
    getActor.mockResolvedValue(merchant);
    await call();
    expect(whereOf().brand).toEqual({ merchantId: 'm-a' });
  });

  it('소문자로 맞춰 찾는다 — searchText 가 소문자다', async () => {
    await call('STUDIO');
    expect(whereOf().searchText).toEqual({ contains: 'studio' });
  });

  it('검색어가 없으면 조건 없이 상위만 준다', async () => {
    await GET(new Request('http://localhost/api/admin/products/search'));
    expect(whereOf().searchText).toBeUndefined();
  });

  it('지운 상품만 뺀다 — 내려간 상품은 미리 담아 둘 수 있어야 한다', async () => {
    await call();
    expect(whereOf().deletedAt).toBeNull();
    expect(whereOf().status).toBeUndefined();
    expect(whereOf().publishedAt).toBeUndefined();
  });

  it('내려간 상품인지는 함께 알려 준다 — 감추지 않고 표시한다', async () => {
    db.product.findMany.mockResolvedValue([
      {
        id: 'p-1', slug: 'coat', name: '코트', status: 'HIDDEN', publishedAt: null,
        brand: { name: 'B' }, images: [],
      },
      {
        id: 'p-2', slug: 'knit', name: '니트', status: 'ACTIVE',
        publishedAt: new Date('2026-01-01'), brand: { name: 'B' }, images: [{ url: '/k.jpg' }],
      },
    ]);

    const body = (await (await call()).json()) as { products: { onDisplay: boolean }[] };
    expect(body.products.map((p) => p.onDisplay)).toEqual([false, true]);
  });

  it('한 번에 주는 수를 제한한다', async () => {
    await call();
    expect(db.product.findMany.mock.calls[0]![0].take).toBeLessThanOrEqual(20);
  });
});
