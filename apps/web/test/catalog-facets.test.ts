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
const cache = await vi.hoisted(async () => (await import('./support/cache-mock')).cacheMock());
vi.mock('~/lib/cache', () => cache);

const { searchProducts, getFacets, getBrandOptions } = await import('~/lib/queries/catalog/search');
const { getBrandBySlug } = await import('~/lib/queries/catalog/brands');

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

describe('브랜드로 좁히는 두 길', () => {
  /*
   * **브랜드는 두 가지 방식으로 온다.** 브랜드 화면은 주소로 하나를 고정하고,
   * 다른 화면은 좁혀 보기로 여럿을 고른다. 소스에 "둘을 겹쳐 쓰지 않는다" 고
   * 적혀 있는데 — 겹치면 어느 쪽이 이기는지 화면마다 달라진다 — 여럿 고르는
   * 길과 그 우선순위가 한 줄도 안 돌고 있었다.
   */
  it('여럿 고르면 그 안에서 찾는다', async () => {
    await searchProducts({ brands: ['moor', 'studio-noon'] });

    expect(whereOf().brand.slug).toEqual({ in: ['moor', 'studio-noon'] });
  });

  it('브랜드 화면 안에서는 좁혀 보기를 무시한다 — 주소가 이긴다', async () => {
    await searchProducts({ brandSlug: 'moor', brands: ['studio-noon'] });

    expect(whereOf().brand.slug).toBe('moor');
  });

  it('둘 다 없으면 브랜드 조건을 좁히지 않는다 — 팔 수 있는 브랜드 조건만 남는다', async () => {
    await searchProducts({ brands: [] });

    expect(whereOf().brand.slug).toBeUndefined();
    expect(whereOf().brand.OR).toBeDefined();
  });

  it('색·사이즈 축도 브랜드 화면의 범위를 따른다 — 남의 브랜드 색을 띄우지 않는다', async () => {
    await getFacets({ brandSlug: 'moor' });

    const scope = db.productOptionValue.findMany.mock.calls[0]![0].where.group.product;
    expect(scope.brand.slug).toBe('moor');
  });
});

describe('고를 수 있는 브랜드', () => {
  /*
   * **색·사이즈와 같은 규칙이다.** 카테고리에 없는 브랜드를 띄우면 누른 사람은
   * 빈 화면을 만나고, 그것이 이 기능에서 가장 나쁜 상태다. 이 함수가 통째로
   * 안 돌고 있었다.
   */
  const brands = [{ slug: 'moor', name: 'MOOR' }, { slug: 'noon', name: 'NOON' }];
  const scopeOf = () => db.product.findMany.mock.calls[0]![0].where;

  it('지금 보이는 상품들의 브랜드를 접어서 준다 — 브랜드 테이블을 훑지 않는다', async () => {
    db.product.findMany.mockResolvedValue(brands.map((brand) => ({ brand })));

    await expect(getBrandOptions({})).resolves.toEqual(brands);

    const call = db.product.findMany.mock.calls[0]![0];
    expect(call.distinct).toEqual(['brandId']);
    expect(call.orderBy).toEqual({ brand: { name: 'asc' } });
    expect(scopeOf().brand.OR, '팔 수 있는 브랜드만 센다').toBeDefined();
  });

  it('하나뿐이면 축으로 두지 않는다 — 누르나 마나 같은 목록이다', async () => {
    db.product.findMany.mockResolvedValue([{ brand: brands[0] }]);

    await expect(getBrandOptions({})).resolves.toEqual([]);
  });

  it('카테고리를 주면 그 안에서만 센다', async () => {
    db.category.findUnique.mockResolvedValue({ id: 'c-outer', children: [{ id: 'c-coat' }] });
    db.product.findMany.mockResolvedValue(brands.map((brand) => ({ brand })));

    await getBrandOptions({ categorySlug: 'outer' });

    expect(scopeOf().categoryId).toEqual({ in: ['c-outer', 'c-coat'] });
  });

  it('없는 카테고리에는 아무것도 주지 않는다 — 엉뚱한 목록이 빈 목록보다 나쁘다', async () => {
    db.category.findUnique.mockResolvedValue(null);

    await expect(getBrandOptions({ categorySlug: '없는-갈래' })).resolves.toEqual([]);
    expect(db.product.findMany).not.toHaveBeenCalled();
  });

  it('검색어를 주면 그 말에 걸리는 상품의 브랜드만 센다', async () => {
    db.product.findMany.mockResolvedValue(brands.map((brand) => ({ brand })));

    await getBrandOptions({ q: '코트' });

    // 검색은 낱말마다 조건을 쌓는다(shelf 의 searchWhere)
    expect(scopeOf().AND).toEqual([{ searchText: { contains: '코트' } }]);
  });
});
