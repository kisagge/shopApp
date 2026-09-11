import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  product: { findMany: vi.fn<(...a: any[]) => any>().mockResolvedValue([]) },
  brand: { findMany: vi.fn<(...a: any[]) => any>().mockResolvedValue([]) },
  category: { findMany: vi.fn<(...a: any[]) => any>().mockResolvedValue([]) },
  $queryRaw: vi.fn<(...a: any[]) => any>().mockResolvedValue([]),
}));
vi.mock('@shop/db', () => ({ prisma: db, Prisma: { join: () => '' } }));
/*
 * 캐시는 값을 **JSON 으로 저장한다.** 흉내에서도 직렬화해 본다 — 그러지
 * 않으면 bigint 가 섞여 들어와도 여기서는 통과하고 빌드한 서버에서만 터진다.
 */
vi.mock('~/lib/cache', () => ({
  cachedRead:
    (fn: (...a: any[]) => any) =>
    async (...a: any[]) => {
      const value = await fn(...a);
      JSON.stringify(value);
      return value;
    },
  TAG: { catalog: 'catalog' },
  TTL: { catalog: 60 },
}));

const { getSearchSuggestions, getPopularSearches } = await import('~/lib/queries/catalog/suggest');

beforeEach(() => {
  vi.clearAllMocks();
  db.product.findMany.mockResolvedValue([]);
  db.brand.findMany.mockResolvedValue([]);
  db.category.findMany.mockResolvedValue([]);
  db.$queryRaw.mockResolvedValue([]);
});

describe('자동완성', () => {
  it('로마자 한 글자에는 DB 를 부르지 않는다', async () => {
    // 'a' 하나가 서른넷 중 열아홉을 문다. 그건 제안이 아니라 목록이다.
    expect(await getSearchSuggestions('a')).toEqual([]);
    expect(db.product.findMany).not.toHaveBeenCalled();
    expect(db.brand.findMany).not.toHaveBeenCalled();
    expect(db.category.findMany).not.toHaveBeenCalled();
  });

  it('한글 한 음절에는 부른다 — 검색이 찾는 것을 자동완성도 안다', async () => {
    // `울` 은 여덟만 문다. 검색은 찾는데 여기만 조용하면 안 파는 것처럼 보인다.
    await getSearchSuggestions('울');
    expect(db.product.findMany).toHaveBeenCalled();
  });

  it('공백만 친 것도 부르지 않는다', async () => {
    expect(await getSearchSuggestions('    ')).toEqual([]);
    expect(db.product.findMany).not.toHaveBeenCalled();
  });

  it('갈래 · 브랜드 · 상품 순으로 준다 — 갈래가 목록으로 가는 지름길이다', async () => {
    db.category.findMany.mockResolvedValue([{ slug: 'outer-coat', name: '코트' }]);
    db.brand.findMany.mockResolvedValue([{ slug: 'studio-noon', name: 'STUDIO NOON' }]);
    db.product.findMany.mockResolvedValue([{ slug: 'wool-coat', name: '울 코트' }]);

    expect(await getSearchSuggestions('코트')).toEqual([
      { kind: 'category', label: '코트', href: '/category/outer-coat' },
      // 브랜드는 검색이 아니라 브랜드 화면으로 보낸다 — 검색은 글자가
      // 스치기만 해도 걸려서 남의 상품 설명까지 함께 나온다
      { kind: 'brand', label: 'STUDIO NOON', href: '/brand/studio-noon' },
      { kind: 'product', label: '울 코트', href: '/product/wool-coat' },
    ]);
  });

  it('대문자로 쳐도 소문자로 찾는다 — searchText 가 소문자다', async () => {
    await getSearchSuggestions('STUDIO');
    expect(db.product.findMany.mock.calls[0]![0].where.AND).toEqual([{ searchText: { contains: 'studio' } }]);
  });

  it('앞뒤 공백을 떼고 찾는다', async () => {
    await getSearchSuggestions('  코트  ');
    expect(db.product.findMany.mock.calls[0]![0].where.AND).toEqual([{ searchText: { contains: '코트' } }]);
  });

  it('숨긴 상품은 제안하지 않는다 — 눌러도 갈 곳이 없다', async () => {
    await getSearchSuggestions('코트');
    const where = db.product.findMany.mock.calls[0]![0].where;
    expect(where.status).toBeDefined();
    expect(where.brand).toBeDefined();
  });

  it('limit 을 넘겨 주지 않는다', async () => {
    db.category.findMany.mockResolvedValue([
      { slug: 'c1', name: 'c1' },
      { slug: 'c2', name: 'c2' },
    ]);
    db.product.findMany.mockResolvedValue([
      { slug: 'p1', name: 'p1' },
      { slug: 'p2', name: 'p2' },
    ]);

    expect(await getSearchSuggestions('코트', 3)).toHaveLength(3);
  });
});

const stat = (term: string, sessions: number, hadResults = true) => ({
  term,
  sessions: BigInt(sessions),
  hadResults,
});

describe('인기 검색어', () => {
  it('bigint 로 오는 세션 수를 숫자로 다룬다', async () => {
    db.$queryRaw.mockResolvedValue([stat('코트', 12), stat('니트', 5)]);
    expect(await getPopularSearches()).toEqual(['코트', '니트']);
  });

  it('결과가 없던 검색어는 빼고 준다 — 눌렀더니 빈 화면이 가장 나쁘다', async () => {
    db.$queryRaw.mockResolvedValue([stat('없는말', 30, false), stat('코트', 4)]);
    expect(await getPopularSearches()).toEqual(['코트']);
  });

  it('한 사람이 헤맨 흔적은 인기가 아니다 — 세션 수가 모자라면 뺀다', async () => {
    db.$queryRaw.mockResolvedValue([stat('코트', 2)]);
    expect(await getPopularSearches()).toEqual([]);
  });

  it('없으면 지어내지 않는다', async () => {
    db.$queryRaw.mockResolvedValue([]);
    expect(await getPopularSearches()).toEqual([]);
  });

  it('limit 만큼만 준다', async () => {
    db.$queryRaw.mockResolvedValue([stat('a', 9), stat('b', 8), stat('c', 7)]);
    expect(await getPopularSearches(2)).toEqual(['a', 'b']);
  });
});
