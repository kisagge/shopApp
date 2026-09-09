import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  collection: {
    findMany: vi.fn<(...a: any[]) => any>().mockResolvedValue([]),
    findUnique: vi.fn<(...a: any[]) => any>().mockResolvedValue(null),
  },
  product: { findMany: vi.fn<(...a: any[]) => any>().mockResolvedValue([]) },
  category: {
    findUnique: vi.fn<(...a: any[]) => any>().mockResolvedValue(null),
    findMany: vi.fn<(...a: any[]) => any>().mockResolvedValue([]),
  },
  $queryRaw: vi.fn<(...a: any[]) => any>().mockResolvedValue([]),
}));
vi.mock('@shop/db', () => ({ prisma: db, Prisma: { join: () => '' } }));

/** 캐시는 값을 JSON 으로 저장한다 — 흉내에서도 직렬화해 본다. */
vi.mock('~/lib/cache', () => ({
  cachedRead:
    (fn: (...a: any[]) => any) =>
    async (...a: any[]) => {
      const value = await fn(...a);
      return JSON.parse(JSON.stringify(value));
    },
  TAG: { catalog: 'catalog', collections: 'collections' },
  TTL: { catalog: 60, collections: 60 },
}));

const { getLiveCollections, getCollection } = await import('~/lib/queries/catalog/collections');

const NOW = new Date('2026-09-01T12:00:00Z');

const card = (over: Record<string, unknown> = {}) => ({
  slug: 'winter-outer', title: '겨울', subtitle: null,
  imageUrl: null, imageAlt: null, imageCredit: null, tone: 'sand',
  isActive: true, startsAt: null, endsAt: null,
  _count: { items: 3 },
  ...over,
});

const productRow = (id: string) => ({
  id, slug: id, name: id, listPrice: 10_000, salePrice: null,
  ratingSum: 0, reviewCount: 0, publishedAt: new Date('2026-01-01'),
  brand: { name: 'BRAND' }, category: { slug: 'outer-coat' }, images: [], variants: [{ stock: 3 }],
});

beforeEach(() => {
  vi.clearAllMocks();
  db.collection.findMany.mockResolvedValue([]);
  db.collection.findUnique.mockResolvedValue(null);
});

describe('기획전 목록', () => {
  it('빈 기획전은 빼고 준다 — 눌렀더니 빈 화면이 가장 나쁘다', async () => {
    db.collection.findMany.mockResolvedValue([
      card({ slug: 'full' }),
      card({ slug: 'empty', _count: { items: 0 } }),
    ]);
    expect((await getLiveCollections(NOW)).map((c) => c.slug)).toEqual(['full']);
  });

  it('담긴 수를 매대 조건을 지난 것만 센다', async () => {
    await getLiveCollections(NOW);
    const where = db.collection.findMany.mock.calls[0]![0].select._count.select.items.where;
    expect(where.product.publishedAt).toEqual({ not: null });
    expect(where.product.deletedAt).toBeNull();
    expect(where.product.brand).toBeDefined();
  });

  it('끝났거나 시작 전이면 안 준다', async () => {
    db.collection.findMany.mockResolvedValue([
      card({ slug: 'ended', endsAt: new Date('2026-01-01T00:00:00Z') }),
      card({ slug: 'later', startsAt: new Date('2027-01-01T00:00:00Z') }),
      card({ slug: 'off', isActive: false }),
      card({ slug: 'now' }),
    ]);
    expect((await getLiveCollections(NOW)).map((c) => c.slug)).toEqual(['now']);
  });

  it('캐시를 지나온 날짜가 문자열이어도 기간을 판정한다', async () => {
    // 흉내가 JSON 을 통과시키므로 Date 는 이미 문자열로 바뀌어 돌아온다
    db.collection.findMany.mockResolvedValue([
      card({ slug: 'ended', endsAt: new Date('2026-01-01T00:00:00Z') }),
    ]);
    expect(await getLiveCollections(NOW)).toEqual([]);
  });
});

describe('기획전 하나', () => {
  const detail = (over: Record<string, unknown> = {}) => ({
    slug: 'winter-outer', title: '겨울', subtitle: null, description: null,
    imageUrl: null, imageAlt: null, imageCredit: null, tone: 'sand',
    isActive: true, startsAt: null, endsAt: null,
    items: [{ product: productRow('a') }, { product: productRow('b') }],
    ...over,
  });

  it('담긴 순서를 그대로 지킨다 — 순서 자체가 편집이다', async () => {
    db.collection.findUnique.mockResolvedValue(detail());
    const found = await getCollection('winter-outer', NOW);
    expect(found?.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(db.collection.findUnique.mock.calls[0]![0].select.items.orderBy).toEqual({
      sortOrder: 'asc',
    });
  });

  it('숨긴 상품이 새지 않게 조회에 매대 조건을 건다', async () => {
    db.collection.findUnique.mockResolvedValue(detail());
    await getCollection('winter-outer', NOW);
    const where = db.collection.findUnique.mock.calls[0]![0].select.items.where;
    expect(where.product.publishedAt).toEqual({ not: null });
    expect(where.product.status).toBeDefined();
  });

  it('게시 기간이 아니면 없는 것으로 다룬다', async () => {
    db.collection.findUnique.mockResolvedValue(detail({ isActive: false }));
    expect(await getCollection('winter-outer', NOW)).toBeNull();
  });

  it('없는 주소는 null', async () => {
    expect(await getCollection('없는것', NOW)).toBeNull();
  });

  it('담긴 상품이 모두 내려가도 화면은 열린다 — 주소는 살아 있다', async () => {
    db.collection.findUnique.mockResolvedValue(detail({ items: [] }));
    const found = await getCollection('winter-outer', NOW);
    expect(found).not.toBeNull();
    expect(found?.itemCount).toBe(0);
  });
});
