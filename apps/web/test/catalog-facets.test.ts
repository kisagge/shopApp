import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  product: {
    findMany: vi.fn<(...a: any[]) => any>().mockResolvedValue([]),
    count: vi.fn<(...a: any[]) => any>().mockResolvedValue(0),
  },
  productOptionValue: { findMany: vi.fn<(...a: any[]) => any>().mockResolvedValue([]) },
  brand: { findFirst: vi.fn<(...a: any[]) => any>().mockResolvedValue(null) },
  category: {
    findUnique: vi.fn<(...a: any[]) => any>().mockResolvedValue(null),
    findMany: vi.fn<(...a: any[]) => any>().mockResolvedValue([]),
  },
  $queryRaw: vi.fn<(...a: any[]) => any>().mockResolvedValue([]),
}));
vi.mock('@shop/db', () => ({ prisma: db, Prisma: { join: () => '' } }));
vi.mock('~/lib/cache', () => ({
  cachedRead: (fn: unknown) => fn,
  TAG: { catalog: 'catalog', collections: 'collections' },
  TTL: { catalog: 60, collections: 60 },
}));

const { searchProducts, getFacets, getBrandBySlug } = await import('~/lib/queries/products');

beforeEach(() => {
  vi.clearAllMocks();
  db.product.findMany.mockResolvedValue([]);
  db.product.count.mockResolvedValue(0);
  db.productOptionValue.findMany.mockResolvedValue([]);
  db.brand.findFirst.mockResolvedValue(null);
});

const whereOf = () => db.product.findMany.mock.calls[0]![0].where;

describe('색상·사이즈로 좁히기', () => {
  it('고르지 않았으면 변형 조건을 걸지 않는다', async () => {
    await searchProducts({});
    expect(whereOf().variants).toBeUndefined();
  });

  it('**같은 변형**이 색과 사이즈를 함께 가져야 한다', async () => {
    /*
     * 따로 걸면 "블랙이 있고 M 도 있는 상품" 이 걸린다 — 블랙은 L 만 있고
     * M 은 흰색뿐인 상품이 "블랙 M" 에 나온다.
     */
    await searchProducts({ color: ['블랙'], size: ['M'] });

    const variants = whereOf().variants;
    expect(variants.some.isActive).toBe(true);
    expect(variants.some.AND).toHaveLength(2);
    expect(variants.some.AND[0].optionValues.some.group.name).toBe('색상');
    expect(variants.some.AND[0].optionValues.some.value.in).toEqual(['블랙']);
    expect(variants.some.AND[1].optionValues.some.group.name).toBe('사이즈');
  });

  it('한 축만 골라도 된다', async () => {
    await searchProducts({ size: ['M', 'L'] });
    expect(whereOf().variants.some.AND).toHaveLength(1);
  });

  it('내린 변형은 세지 않는다 — 눌러도 살 수 없다', async () => {
    await searchProducts({ color: ['블랙'] });
    expect(whereOf().variants.some.isActive).toBe(true);
  });

  it('품절은 거르지 않는다 — 거르지 않은 목록도 품절을 보여 준다', async () => {
    await searchProducts({ color: ['블랙'] });
    expect(JSON.stringify(whereOf().variants)).not.toContain('stock');
  });
});

describe('고를 수 있는 값', () => {
  const row = (group: string, value: string, swatchHex: string | null = null) => ({
    value, swatchHex, sortOrder: 0, group: { name: group },
  });

  it('색상에는 스와치 색을 함께 준다', async () => {
    db.productOptionValue.findMany.mockResolvedValue([
      row('색상', '블랙', '#181613'),
      row('사이즈', 'M'),
    ]);

    const facets = await getFacets({});
    expect(facets.color).toEqual([{ value: '블랙', swatchHex: '#181613' }]);
    expect(facets.size).toEqual([{ value: 'M', swatchHex: null }]);
  });

  it('같은 값이 상품마다 있어도 한 번만 준다', async () => {
    db.productOptionValue.findMany.mockResolvedValue([
      row('사이즈', 'M'), row('사이즈', 'M'), row('사이즈', 'L'),
    ]);
    expect((await getFacets({})).size.map((v) => v.value)).toEqual(['M', 'L']);
  });

  it('지금 범위 안에 있는 값만 본다 — 니트 화면에 청바지 사이즈를 띄우지 않는다', async () => {
    db.category.findUnique.mockResolvedValue({ id: 'c-knit', children: [] });
    await getFacets({ categorySlug: 'knit' });

    const where = db.productOptionValue.findMany.mock.calls[0]![0].where;
    expect(where.group.product.categoryId).toEqual({ in: ['c-knit'] });
    expect(where.group.product.publishedAt).toEqual({ not: null });
  });

  it('없는 카테고리에는 아무것도 주지 않는다', async () => {
    db.category.findUnique.mockResolvedValue(null);
    expect(await getFacets({ categorySlug: '없는것' })).toEqual({ color: [], size: [] });
  });

  it('고른 값은 범위에서 빼지 않는다 — 빼면 되돌릴 길이 없어진다', async () => {
    // getFacets 는 색·사이즈를 아예 인자로 받지 않는다. 그것이 규칙이다.
    await getFacets({ categorySlug: undefined, q: '코트' });
    const where = db.productOptionValue.findMany.mock.calls[0]![0].where;
    expect(JSON.stringify(where)).not.toContain('variants');
  });
});

describe('브랜드', () => {
  it('정지된 가맹점의 브랜드는 주지 않는다 — 목록에서만 빼면 뒷문이 된다', async () => {
    await getBrandBySlug('studio-noon');
    const where = db.brand.findFirst.mock.calls[0]![0].where;
    expect(where.slug).toBe('studio-noon');
    expect(where.OR).toBeDefined();
  });

  it('브랜드로 좁히는 것은 검색이 아니라 조건이다', async () => {
    await searchProducts({ brandSlug: 'moor' });
    expect(whereOf().brand.slug).toBe('moor');
    expect(whereOf().searchText).toBeUndefined();
  });
});
