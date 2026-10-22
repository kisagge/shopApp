import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 갈래 전체 — `/categories` 가 쓰는 조회.
 *
 * **머리와 발은 최상위만 보여 준다.** 그래서 `아우터 > 코트` 같은 하위 갈래는 상품 화면의
 * 이동 경로나 검색으로만 만났다 — 사이트맵에는 진작 들어가 있던 주소들이다(크롤러는 아는데
 * 사람은 모르는 자리).
 *
 * 여기서 지킬 것은 사이트맵이 쓰는 규칙과 같다: **빈 갈래는 만들지 않는다.** 눌러서
 * 들어갔더니 빈 화면인 길을 내지 않는 것이고, 상품은 잎 갈래에 달리므로 자기 것과 자식 것을
 * 함께 센다.
 */

const db = vi.hoisted(() => ({ category: { findMany: vi.fn<(...a: any[]) => any>() } }));
vi.mock('@shop/db', () => ({ prisma: db }));
const cache = await vi.hoisted(async () => (await import('./support/cache-mock')).cacheMock());
vi.mock('~/lib/cache', () => cache);

const { getCategoryTree } = await import('~/lib/queries/catalog/products');

const node = (slug: string, own: number, children: [string, number][] = []) => ({
  slug, name: slug, _count: { products: own },
  children: children.map(([s, n]) => ({ slug: s, name: s, _count: { products: n } })),
});

beforeEach(() => {
  vi.clearAllMocks();
  db.category.findMany.mockResolvedValue([node('outer', 2, [['coat', 3]])]);
});

describe('갈래 나무', () => {
  it('최상위만 뿌리로 삼고 자식을 안에 담는다', async () => {
    const tree = await getCategoryTree();

    expect(db.category.findMany.mock.calls[0]![0].where).toEqual({ parentId: null });
    expect(tree).toEqual([
      { slug: 'outer', name: 'outer', count: 5, children: [{ slug: 'coat', name: 'coat', count: 3 }] },
    ]);
  });

  it('상품 수는 자기 것과 자식 것을 합한다', async () => {
    // 상품은 잎 갈래에 달린다 — 자기 것만 세면 "아우터 0개" 가 뜬다
    db.category.findMany.mockResolvedValue([node('outer', 0, [['coat', 3], ['jacket', 2]])]);

    expect((await getCategoryTree())[0]?.count).toBe(5);
  });

  it('빈 갈래는 내보내지 않는다 — 눌러서 빈 화면을 만나지 않게', async () => {
    db.category.findMany.mockResolvedValue([node('outer', 0, []), node('knit', 1)]);

    expect((await getCategoryTree()).map((c) => c.slug)).toEqual(['knit']);
  });

  it('빈 하위 갈래도 빠진다', async () => {
    db.category.findMany.mockResolvedValue([node('outer', 1, [['coat', 0], ['jacket', 2]])]);

    expect((await getCategoryTree())[0]?.children.map((c) => c.slug)).toEqual(['jacket']);
  });

  it('보이는 상품만 센다 — 숨긴 상품이 수에 들어가면 그 수가 거짓이 된다', async () => {
    await getCategoryTree();

    const select = db.category.findMany.mock.calls[0]![0].select;
    expect(select._count.select.products.where, '상위 갈래의 셈에 조건이 없다').toBeTruthy();
    expect(select.children.select._count.select.products.where, '하위 갈래의 셈에 조건이 없다').toBeTruthy();
  });

  it('사람이 정한 차례를 따른다 — 위아래 둘 다', async () => {
    // 갈래는 이름순이 아니라 가게가 정한 순서로 선다(sortOrder)
    await getCategoryTree();

    const args = db.category.findMany.mock.calls[0]![0];
    expect(args.orderBy).toEqual({ sortOrder: 'asc' });
    expect(args.select.children.orderBy).toEqual({ sortOrder: 'asc' });
  });
});
