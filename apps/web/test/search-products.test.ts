import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  product: { findMany: vi.fn<(...a: any[]) => any>(), count: vi.fn<(...a: any[]) => any>() },
  category: { findUnique: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db, Prisma: {} }));

const { searchProducts } = await import('~/lib/queries/catalog/search');

const row = (id: string, over: Record<string, unknown> = {}) => ({
  id, slug: `p-${id}`, name: '코트', listPrice: 100_000, salePrice: null,
  ratingSum: 0, reviewCount: 0, publishedAt: new Date('2026-01-01'),
  brand: { name: 'MOOR' }, category: { slug: 'outer-coat' }, images: [], variants: [{ stock: 3 }],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.product.findMany.mockResolvedValue([]);
  db.product.count.mockResolvedValue(0);
});

const whereOf = () => db.product.findMany.mock.calls[0]?.[0].where;
const orderOf = () => db.product.findMany.mock.calls[0]?.[0].orderBy;

/**
 * 검색어가 만든 조건. 낱말마다 하나씩 달린다.
 *
 * **한 덩어리로 걸던 것을 낱말로 쪼갰다** — "울 코트" 가 0건이던 것을 고치면서다.
 * 그래서 조건이 `searchText` 하나가 아니라 `AND` 배열이 된다.
 */
const searchTextOf = () =>
  ((whereOf()?.AND ?? []) as { searchText?: unknown }[]).map((c) => c.searchText);

describe('검색어', () => {
  it('상품명과 브랜드명을 합친 한 컬럼을 본다', async () => {
    // 두 테이블에 OR 를 걸면 Postgres 가 어느 인덱스도 못 쓴다.
    // 5만 행 기준 1196 → 14 buffers 차이였다.
    await searchProducts({ q: '코트' });
    expect(searchTextOf()).toEqual([{ contains: '코트' }]);
    expect(whereOf().OR).toBeUndefined();
  });

  it('소문자로 맞춰 찾는다 — 저장도 소문자다', async () => {
    await searchProducts({ q: 'MOOR' });
    expect(searchTextOf()).toEqual([{ contains: 'moor' }]);
  });

  it('한글 한 글자도 검색어로 친다 — 한 글자가 낱말이다', async () => {
    /*
     * 예전에는 한 글자를 전부 거절했다. 운영에서 "울" 을 찾으면 상품 서른넷
     * 중 여덟이 걸려야 하는데 0건이 나갔다 — 근거였던 "카탈로그 전체가
     * 걸린다" 는 라틴 문자 이야기였다("a" 는 열아홉에 걸린다).
     */
    const page = await searchProducts({ q: '울' });
    expect(page.term).toBe('울');
    expect(searchTextOf()).toEqual([{ contains: '울' }]);
  });

  it('낱말마다 조건을 하나씩 단다 — 떨어져 있어도 찾는다', async () => {
    /*
     * 한 덩어리로 걸면 **"울 코트" 가 0건**이다. "오버사이즈 울 블렌드 코트"
     * 안에 두 낱말이 다 있는데 사이에 "블렌드" 가 끼어 있기 때문이다.
     */
    await searchProducts({ q: '울 코트' });
    expect(searchTextOf()).toEqual([{ contains: '울' }, { contains: '코트' }]);
  });

  it('라틴 한 글자는 여전히 검색어로 치지 않는다', async () => {
    const page = await searchProducts({ q: 'a' });
    expect(page.term).toBeNull();
    expect(searchTextOf()).toEqual([]);
  });

  it('앞뒤 공백을 정리해 쓴다', async () => {
    const page = await searchProducts({ q: '  울  코트 ' });
    expect(page.term).toBe('울 코트');
  });
});

describe('정렬', () => {
  it.each([
    ['recommended', 'soldCount'],
    ['newest', 'publishedAt'],
    ['price_asc', 'sellingPrice'],
    ['price_desc', 'sellingPrice'],
  ] as const)('%s 는 %s 로 정렬한다', async (sort, field) => {
    await searchProducts({ sort });
    expect(Object.keys(orderOf()[0])[0]).toBe(field);
  });

  it('가격 정렬 방향이 반대다', async () => {
    await searchProducts({ sort: 'price_asc' });
    expect(orderOf()[0].sellingPrice).toBe('asc');
    vi.clearAllMocks();
    db.product.findMany.mockResolvedValue([]);
    db.product.count.mockResolvedValue(0);
    await searchProducts({ sort: 'price_desc' });
    expect(orderOf()[0].sellingPrice).toBe('desc');
  });

  it('어느 정렬이든 id 를 마지막 축으로 붙인다', async () => {
    // 같은 값이 여럿이면 순서가 요청마다 달라져 커서가 행을 건너뛴다
    for (const sort of ['recommended', 'newest', 'price_asc', 'price_desc'] as const) {
      vi.clearAllMocks();
      db.product.findMany.mockResolvedValue([]);
      db.product.count.mockResolvedValue(0);
      await searchProducts({ sort });
      expect(orderOf().at(-1)).toEqual({ id: 'desc' });
    }
  });

  it('정렬을 안 주면 추천순이다', async () => {
    await searchProducts({});
    expect(Object.keys(orderOf()[0])[0]).toBe('soldCount');
  });
});

describe('가격 범위', () => {
  it('양쪽 경계를 건다', async () => {
    await searchProducts({ minPrice: 50_000, maxPrice: 100_000 });
    expect(whereOf().sellingPrice).toEqual({ gte: 50_000, lte: 100_000 });
  });

  it('한쪽만 줘도 된다', async () => {
    await searchProducts({ minPrice: 50_000 });
    expect(whereOf().sellingPrice).toEqual({ gte: 50_000 });
  });

  it('뒤집힌 범위를 바로잡아 건다', async () => {
    await searchProducts({ minPrice: 100_000, maxPrice: 50_000 });
    expect(whereOf().sellingPrice).toEqual({ gte: 50_000, lte: 100_000 });
  });

  it('범위가 없으면 조건을 넣지 않는다', async () => {
    await searchProducts({});
    expect(whereOf().sellingPrice).toBeUndefined();
  });
});

describe('노출 조건', () => {
  it('삭제·미게시·초안은 언제나 제외한다', async () => {
    await searchProducts({});
    const w = whereOf();
    expect(w.deletedAt).toBeNull();
    expect(w.publishedAt).toEqual({ not: null });
    expect(w.status).toEqual({ in: ['ACTIVE', 'SOLD_OUT'] });
  });

  it('정지된 가맹점의 상품은 나오지 않는다', async () => {
    await searchProducts({});
    expect(whereOf().brand).toEqual({
      OR: [{ merchantId: null }, { merchant: { status: 'APPROVED' } }],
    });
  });
});

describe('카테고리', () => {
  it('하위 카테고리까지 포함한다', async () => {
    db.category.findUnique.mockResolvedValue({ id: 'c-1', children: [{ id: 'c-2' }] });
    await searchProducts({ categorySlug: 'outer' });
    expect(whereOf().categoryId).toEqual({ in: ['c-1', 'c-2'] });
  });

  it('없는 카테고리면 빈 결과를 준다 — 전체를 보여 주지 않는다', async () => {
    // 잘못된 슬러그로 엉뚱한 목록을 내놓는 편이 빈 목록보다 나쁘다
    db.category.findUnique.mockResolvedValue(null);
    const page = await searchProducts({ categorySlug: 'nope' });
    expect(page).toMatchObject({ items: [], total: 0, nextCursor: null });
    expect(db.product.findMany).not.toHaveBeenCalled();
  });
});

describe('페이지네이션', () => {
  it('한 쪽 더 읽어 다음 쪽 존재를 판단한다', async () => {
    db.product.findMany.mockResolvedValue(['a', 'b', 'c', 'd'].map((i) => row(i)));
    const page = await searchProducts({ take: 3 });
    expect(db.product.findMany.mock.calls[0]?.[0].take).toBe(4);
    expect(page.items).toHaveLength(3);
    expect(page.nextCursor).toBe('c');
  });

  it('마지막 쪽이면 커서가 없다', async () => {
    db.product.findMany.mockResolvedValue([row('a')]);
    expect((await searchProducts({ take: 3 })).nextCursor).toBeNull();
  });

  it('커서 행은 건너뛴다', async () => {
    db.product.findMany.mockResolvedValue([row('z')]);
    await searchProducts({ cursor: 'a' });
    const args = db.product.findMany.mock.calls[0]?.[0];
    expect(args.cursor).toEqual({ id: 'a' });
    expect(args.skip).toBe(1);
  });

  it('전체 건수는 첫 쪽에서만 센다', async () => {
    // 카운트는 조건에 맞는 행을 전부 훑는다. 매 쪽마다 돌리면
    // "더 보기" 한 번에 그 비용이 그대로 붙는다.
    await searchProducts({});
    expect(db.product.count).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    db.product.findMany.mockResolvedValue([]);
    const page = await searchProducts({ cursor: 'a' });
    expect(db.product.count).not.toHaveBeenCalled();
    expect(page.total).toBeNull();
  });

  it('한 쪽 크기에 상한이 있다', async () => {
    await searchProducts({ take: 9999 });
    expect(db.product.findMany.mock.calls[0]?.[0].take).toBe(49);
  });
});

/**
 * 쪽 나눔.
 *
 * **아직 한 번도 안 돌았다.** 한 쪽이 24개인데 가장 큰 카테고리가 13개라,
 * 화면에서는 "더 보기" 가 나타날 일이 없다. 매대가 자라는 날 처음 도는
 * 코드이고, 그날 틀리면 손님이 상품을 못 보거나 같은 상품을 두 번 본다.
 *
 * 그래서 여기서 미리 밟아 둔다.
 */
const argsOf = (call = 0) => db.product.findMany.mock.calls[call]?.[0];

describe('쪽 나눔', () => {
  it('한 개를 더 청구해 더 있는지 본다 — 두 번 묻지 않는다', async () => {
    await searchProducts({ take: 3 });
    // 총 건수를 세는 질의로 판단하면 쪽마다 두 번 묻게 된다
    expect(argsOf().take).toBe(4);
  });

  it('더 있으면 청구한 한 개는 돌려주지 않는다', async () => {
    db.product.findMany.mockResolvedValue([row('a'), row('b'), row('c'), row('d')]);

    const page = await searchProducts({ take: 3 });

    expect(page.items).toHaveLength(3);
    expect(page.items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('다음 커서는 돌려준 마지막 것이다 — 넘겨다본 것이 아니다', async () => {
    /*
     * 여기서 'd' 를 주면 다음 쪽이 'd' 다음부터 시작해 **'d' 가 통째로
     * 건너뛰어진다.** 화면에서는 상품 하나가 조용히 사라진다.
     */
    db.product.findMany.mockResolvedValue([row('a'), row('b'), row('c'), row('d')]);

    const page = await searchProducts({ take: 3 });

    expect(page.nextCursor).toBe('c');
  });

  it('마지막 쪽이면 커서를 주지 않는다', async () => {
    db.product.findMany.mockResolvedValue([row('a'), row('b')]);

    const page = await searchProducts({ take: 3 });

    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
  });

  it('커서를 받으면 그 줄은 건너뛴다', async () => {
    // skip 이 없으면 쪽마다 첫 줄이 앞 쪽의 마지막 줄과 겹친다
    await searchProducts({ take: 3, cursor: 'c' });

    expect(argsOf().cursor).toEqual({ id: 'c' });
    expect(argsOf().skip).toBe(1);
  });

  it('첫 쪽에서만 총 건수를 센다', async () => {
    /*
     * 화면이 이미 총 건수를 들고 있다. 쪽마다 다시 세면 "더 보기" 를 누를
     * 때마다 전체를 훑는 질의가 하나씩 더 붙는다.
     */
    await searchProducts({ take: 3 });
    expect(db.product.count).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    db.product.findMany.mockResolvedValue([]);
    await searchProducts({ take: 3, cursor: 'c' });
    expect(db.product.count).not.toHaveBeenCalled();
  });

  it('한 쪽에 담을 수 있는 양에 상한이 있다', async () => {
    // 주소로 take 를 크게 넣어 전체를 한 번에 긁어 가지 못하게 한다
    await searchProducts({ take: 10_000 });
    expect(argsOf().take).toBeLessThanOrEqual(49);
  });
});
