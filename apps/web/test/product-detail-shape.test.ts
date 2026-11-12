import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  product: {
    findFirst: vi.fn<(...a: any[]) => any>(),
    findMany: vi.fn<(...a: any[]) => any>(),
  },
  productSlug: { findFirst: vi.fn<(...a: any[]) => any>() },
  category: {
    findMany: vi.fn<(...a: any[]) => any>(),
    findUnique: vi.fn<(...a: any[]) => any>(),
  },
}));
vi.mock('@shop/db', () => ({ prisma: db, Prisma: {} }));

const {
  getProductBySlug, getProductsBySlugs, getProductSlugMovedTo,
  getIndexableCategorySlugs, getCategoryWithChildren, getTopCategories,
} = await import('~/lib/queries/catalog/products');

/**
 * 상세 화면이 받는 모양.
 *
 * **거르는 조건은 보고 있었는데 내놓는 모양이 안 돌았다**(`storefront-visibility`
 * 가 where 절을 본다). 흉내가 늘 `null` 을 돌려주어 매핑 안쪽이 한 줄도 안
 * 돌았고, 거기에 **값과 품절과 옵션 가격**이 들어 있다 — 손님이 보고 누르는 수다.
 *
 * 같은 파일의 사이트맵·카테고리 조회도 함께 본다.
 */

const row = (over: Record<string, unknown> = {}) => ({
  id: 'p-1', slug: 'wool-coat', name: '울 코트', description: '설명',
  brand: { name: '무어', slug: 'moor' }, brandId: 'b-1',
  category: { name: '코트', slug: 'outer-coat' }, categoryId: 'c-1',
  listPrice: 200_000, salePrice: null,
  ratingSum: 0, reviewCount: 0,
  optionGroups: [], variants: [], images: [],
  ...over,
});

const variant = (over: Record<string, unknown> = {}) => ({
  id: 'v-1', sku: 'MOOR-1', label: '오트 / M', stock: 3,
  optionValues: [{ id: 'ov-1' }, { id: 'ov-2' }],
  priceOverride: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.product.findFirst.mockResolvedValue(null);
  db.product.findMany.mockResolvedValue([]);
  db.productSlug.findFirst.mockResolvedValue(null);
  db.category.findMany.mockResolvedValue([]);
  db.category.findUnique.mockResolvedValue(null);
});

describe('값', () => {
  it('할인이 없으면 목록가가 곧 판매가고 할인율은 0 이다', async () => {
    /*
     * 0 이지 `undefined` 가 아니다 — 재는 쪽(core 의 `discountRateOf`)이 "깎인
     * 것이 없다" 를 0 으로 말한다. 띠를 띄울지는 화면이 그 수를 보고 정한다.
     */
    db.product.findFirst.mockResolvedValue(row());

    const p = (await getProductBySlug('wool-coat'))!;

    expect(p.listPrice).toBe(200_000);
    expect(p.price).toBe(200_000);
    expect(p.discountPercent).toBe(0);
  });

  it('할인가가 있으면 그 값이 판매가다', async () => {
    db.product.findFirst.mockResolvedValue(row({ salePrice: 150_000 }));

    const p = (await getProductBySlug('wool-coat'))!;

    expect(p.price).toBe(150_000);
    expect(p.discountPercent).toBe(25);
  });

  it('없는 주소는 null 이다 — 거기서 더 읽지 않는다', async () => {
    await expect(getProductBySlug('없는-주소')).resolves.toBeNull();
  });
});

describe('별점', () => {
  it('리뷰가 없으면 별점이 없다 — 0.0 이라고 적으면 나쁜 상품으로 보인다', async () => {
    db.product.findFirst.mockResolvedValue(row({ ratingSum: 0, reviewCount: 0 }));

    expect((await getProductBySlug('wool-coat'))!.rating).toBeUndefined();
  });

  it('리뷰가 있으면 합을 수로 나눈다', async () => {
    db.product.findFirst.mockResolvedValue(row({ ratingSum: 22, reviewCount: 5 }));

    expect((await getProductBySlug('wool-coat'))!.rating).toBe(4.4);
  });
});

describe('품절', () => {
  it('옵션이 아직 없으면 품절이 아니다 — 등록 직후의 상품이다', async () => {
    db.product.findFirst.mockResolvedValue(row({ variants: [] }));

    expect((await getProductBySlug('wool-coat'))!.soldOut).toBe(false);
  });

  it('모든 옵션이 0 이하면 품절이다', async () => {
    db.product.findFirst.mockResolvedValue(row({
      variants: [variant({ stock: 0 }), variant({ id: 'v-2', stock: -1 })],
    }));

    expect((await getProductBySlug('wool-coat'))!.soldOut).toBe(true);
  });

  it('하나라도 남아 있으면 품절이 아니다', async () => {
    db.product.findFirst.mockResolvedValue(row({
      variants: [variant({ stock: 0 }), variant({ id: 'v-2', stock: 1 })],
    }));

    expect((await getProductBySlug('wool-coat'))!.soldOut).toBe(false);
  });
});

describe('옵션', () => {
  it('값 id 만 추려 준다 — 화면은 그 id 로 고른 조합을 맞춘다', async () => {
    db.product.findFirst.mockResolvedValue(row({ variants: [variant()] }));

    expect((await getProductBySlug('wool-coat'))!.variants[0]).toMatchObject({
      id: 'v-1', sku: 'MOOR-1', label: '오트 / M', stock: 3,
      optionValueIds: ['ov-1', 'ov-2'],
    });
  });

  it('따로 적은 값이 없으면 상품 판매가를 쓴다', async () => {
    db.product.findFirst.mockResolvedValue(row({
      salePrice: 150_000, variants: [variant({ priceOverride: null })],
    }));

    expect((await getProductBySlug('wool-coat'))!.variants[0]!.price).toBe(150_000);
  });

  it('따로 적은 값이 있으면 그 값을 쓴다', async () => {
    db.product.findFirst.mockResolvedValue(row({
      salePrice: 150_000, variants: [variant({ priceOverride: 170_000 })],
    }));

    expect((await getProductBySlug('wool-coat'))!.variants[0]!.price).toBe(170_000);
  });

  it('0 원도 적은 값이다 — 비운 것과 다르다', async () => {
    /*
     * 이 저장소는 `null` 을 "기본가" 로, `0` 을 "0원짜리 옵션" 으로 쓴다.
     * 떨어뜨려 쓰면(`priceOverride || price`) 사은품 옵션이 제값을 받는다.
     */
    db.product.findFirst.mockResolvedValue(row({
      salePrice: 150_000, variants: [variant({ priceOverride: 0 })],
    }));

    expect((await getProductBySlug('wool-coat'))!.variants[0]!.price).toBe(0);
  });
});

describe('최근 본 상품을 slug 로 가져올 때', () => {
  it('빈 목록이면 DB 를 부르지 않는다', async () => {
    await expect(getProductsBySlugs([])).resolves.toEqual([]);

    expect(db.product.findMany).not.toHaveBeenCalled();
  });
});

describe('옮겨 간 주소', () => {
  it('옛 주소를 물으면 지금 주소를 돌려준다', async () => {
    db.productSlug.findFirst.mockResolvedValue({ product: { slug: 'wool-coat' } });

    await expect(getProductSlugMovedTo('coat')).resolves.toBe('wool-coat');
  });

  it('기록이 없으면 null 이다', async () => {
    await expect(getProductSlugMovedTo('coat')).resolves.toBeNull();
  });

  it('내려간 상품으로는 넘기지 않는다 — 404 를 두 번 거치게 할 뿐이다', async () => {
    await getProductSlugMovedTo('coat');

    const where = db.productSlug.findFirst.mock.calls[0]![0].where as {
      slug: string;
      product: Record<string, unknown>;
    };
    expect(where.slug).toBe('coat');
    // 매대 조건은 거르는 조건이지 고르는 필드가 아니다
    expect(where.product).toHaveProperty('deletedAt');
    expect(where.product).toHaveProperty('brand');
  });
});

describe('사이트맵에 넣을 갈래', () => {
  const category = (slug: string, own: number, children: number[]) => ({
    slug,
    _count: { products: own },
    children: children.map((n) => ({ _count: { products: n } })),
  });

  it('자기 상품이 있으면 넣는다', async () => {
    db.category.findMany.mockResolvedValue([category('outer-coat', 3, [])]);

    await expect(getIndexableCategorySlugs()).resolves.toEqual(['outer-coat']);
  });

  it('자식에게만 있어도 넣는다 — 상품은 잎 갈래에 달린다', async () => {
    db.category.findMany.mockResolvedValue([category('outer', 0, [2, 0])]);

    await expect(getIndexableCategorySlugs()).resolves.toEqual(['outer']);
  });

  it('자기도 자식도 없으면 뺀다 — 들어오면 빈 화면인 주소를 만들지 않는다', async () => {
    db.category.findMany.mockResolvedValue([
      category('outer', 0, [0]),
      category('bag', 1, []),
    ]);

    await expect(getIndexableCategorySlugs()).resolves.toEqual(['bag']);
  });
});

describe('카테고리 트리', () => {
  it('부모와 자식을 함께 준다', async () => {
    db.category.findUnique.mockResolvedValue({
      id: 'c-1', name: '코트', slug: 'outer-coat',
      parent: { name: '아웃터', slug: 'outer' },
      children: [],
    });

    await expect(getCategoryWithChildren('outer-coat')).resolves.toMatchObject({
      slug: 'outer-coat',
      parent: { slug: 'outer' },
    });
  });

  it('맨 위 갈래만 따로 묻는다 — 부모가 없는 것들이다', async () => {
    db.category.findMany.mockResolvedValue([{ slug: 'outer', name: '아웃터' }]);

    await expect(getTopCategories()).resolves.toEqual([{ slug: 'outer', name: '아웃터' }]);
    expect(db.category.findMany.mock.calls[0]![0].where).toMatchObject({ parentId: null });
  });
});
