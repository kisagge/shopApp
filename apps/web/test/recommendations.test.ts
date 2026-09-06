import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  product: { findMany: vi.fn<(...a: any[]) => any>().mockResolvedValue([]) },
  category: {
    findUnique: vi.fn<(...a: any[]) => any>().mockResolvedValue(null),
    findMany: vi.fn<(...a: any[]) => any>().mockResolvedValue([]),
  },
  $queryRaw: vi.fn<(...a: any[]) => any>().mockResolvedValue([]),
}));
vi.mock('@shop/db', () => ({ prisma: db, Prisma: { join: () => '' } }));
vi.mock('~/lib/cache', () => ({
  cachedRead: (fn: unknown) => fn,
  TAG: { catalog: 'catalog' },
  TTL: { catalog: 60 },
}));

const { getRecommendations } = await import('~/lib/queries/catalog/recommend');

const row = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  slug: id,
  name: id,
  listPrice: 10_000,
  salePrice: null,
  ratingSum: 0,
  reviewCount: 0,
  publishedAt: new Date('2020-01-01'),
  brand: { name: 'BRAND' },
  images: [],
  variants: [{ stock: 3 }],
  ...over,
});

/** 상품 조회가 어떤 where 로 불렸는지 */
const callsWith = (pred: (where: any) => boolean) =>
  db.product.findMany.mock.calls.filter((c) => pred(c[0].where));

beforeEach(() => {
  vi.clearAllMocks();
  db.$queryRaw.mockResolvedValue([]);
  db.product.findMany.mockResolvedValue([]);
  db.category.findUnique.mockResolvedValue({ id: 'c-leaf', parentId: 'c-top', children: [] });
  db.category.findMany.mockResolvedValue([{ id: 'c-leaf' }, { id: 'c-sib' }]);
});

describe('무엇을 추천하는가', () => {
  it('함께 본 순서를 지킨다 — DB 는 순서를 지켜 주지 않는다', async () => {
    db.$queryRaw.mockResolvedValue([{ productId: 'b' }, { productId: 'a' }]);
    db.product.findMany.mockImplementation(async ({ where }: any) =>
      where.id ? [row('a'), row('b')] : [],
    );

    const { items } = await getRecommendations({
      productId: 'me',
      categorySlug: 'outer-coat',
      limit: 8,
    });

    expect(items.map((i) => i.id)).toEqual(['b', 'a']);
  });

  it('기록이 있으면 그렇게 말한다', async () => {
    db.$queryRaw.mockResolvedValue([{ productId: 'a' }]);
    db.product.findMany.mockImplementation(async ({ where }: any) => (where.id ? [row('a')] : []));

    expect((await getRecommendations({ productId: 'me', categorySlug: 'c', limit: 8 })).fromCoView)
      .toBe(true);
  });

  it('기록이 없으면 그렇게 말하지 않는다 — 제목이 거짓이 되면 안 된다', async () => {
    db.product.findMany.mockResolvedValue([row('x'), row('y')]);

    const { items, fromCoView } = await getRecommendations({
      productId: 'me',
      categorySlug: 'c',
      limit: 8,
    });

    expect(items.length).toBeGreaterThan(0);
    expect(fromCoView).toBe(false);
  });

  it('함께 본 상품이 전부 내려갔으면 기록이 없는 것과 같다', async () => {
    // id 는 남아 있어도 매대 조건에서 걸리면 화면에 못 나온다
    db.$queryRaw.mockResolvedValue([{ productId: 'gone' }]);
    db.product.findMany.mockImplementation(async ({ where }: any) => (where.id ? [] : [row('x')]));

    expect((await getRecommendations({ productId: 'me', categorySlug: 'c', limit: 8 })).fromCoView)
      .toBe(false);
  });
});

describe('무엇을 보여 주지 않는가', () => {
  it('매대에 없는 상품은 어느 단에서도 나오지 않는다', async () => {
    db.$queryRaw.mockResolvedValue([{ productId: 'a' }]);
    await getRecommendations({ productId: 'me', categorySlug: 'c', limit: 8 });

    // 함께 본 것 · 매대 · 인기 — 세 조회 모두 같은 조건을 건다
    expect(db.product.findMany.mock.calls.length).toBeGreaterThanOrEqual(3);
    for (const [args] of db.product.findMany.mock.calls) {
      expect(args.where.deletedAt).toBeNull();
      expect(args.where.publishedAt).toEqual({ not: null });
      expect(args.where.status.in).not.toContain('HIDDEN');
      expect(args.where.brand).toBeDefined();
    }
  });

  it('자기 자신은 추천하지 않는다', async () => {
    db.$queryRaw.mockResolvedValue([{ productId: 'me' }]);
    db.product.findMany.mockResolvedValue([row('me'), row('x')]);

    const { items } = await getRecommendations({ productId: 'me', categorySlug: 'c', limit: 8 });

    expect(items.map((i) => i.id)).not.toContain('me');
  });
});

describe('같은 매대를 어떻게 정하는가', () => {
  it('상위가 있으면 형제까지 본다 — 잎만 보면 하나뿐인 갈래가 빈다', async () => {
    await getRecommendations({ productId: 'me', categorySlug: 'outer-coat', limit: 8 });

    const shelf = callsWith((w) => w.categoryId !== undefined)[0];
    expect(shelf![0].where.categoryId.in).toEqual(expect.arrayContaining(['c-top', 'c-leaf', 'c-sib']));
  });

  it('상위가 없으면 자기와 자식을 본다', async () => {
    db.category.findUnique.mockResolvedValue({
      id: 'c-top',
      parentId: null,
      children: [{ id: 'c-a' }],
    });

    await getRecommendations({ productId: 'me', categorySlug: 'outer', limit: 8 });

    const shelf = callsWith((w) => w.categoryId !== undefined)[0];
    expect(shelf![0].where.categoryId.in).toEqual(['c-top', 'c-a']);
  });

  it('없는 카테고리면 매대 조회를 건너뛴다', async () => {
    db.category.findUnique.mockResolvedValue(null);

    await getRecommendations({ productId: 'me', categorySlug: 'nope', limit: 8 });

    expect(callsWith((w) => w.categoryId !== undefined)).toEqual([]);
  });
});

describe('함께 본 기록을 세는 창', () => {
  it('최근 것만 본다 — 오래된 취향은 지금 추천에 도움이 안 된다', async () => {
    await getRecommendations({ productId: 'me', categorySlug: 'c', limit: 8 });

    const params = db.$queryRaw.mock.calls[0]!;
    const since = params.find((p: unknown): p is Date => p instanceof Date);
    expect(since).toBeInstanceOf(Date);
    const days = (Date.now() - since!.getTime()) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(1);
    // 원본은 90일 뒤 롤업이 지운다. 창은 늘 그 안에 있어야 한다.
    expect(days).toBeLessThan(90);
  });
});
