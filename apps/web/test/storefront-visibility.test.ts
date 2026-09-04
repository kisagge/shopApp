import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  product: {
    findMany: vi.fn<(...a: any[]) => any>(),
    findFirst: vi.fn<(...a: any[]) => any>(),
  },
}));
vi.mock('@shop/db', () => ({
  prisma: db,
  Prisma: {},
}));

const { getFeaturedProducts, getProductBySlug, getAllProductSlugs } =
  await import('~/lib/queries/products');

beforeEach(() => {
  vi.clearAllMocks();
  db.product.findMany.mockResolvedValue([]);
  db.product.findFirst.mockResolvedValue(null);
});

/**
 * 매대에 무엇이 보이는가는 **한 곳에서 정한다.**
 *
 * 손으로 적어 두었더니 목록과 검색에는 상태 조건이 있는데 상세와 정적
 * 경로에는 빠져 있었다. 숨긴 상품이 주소로는 그대로 열렸다 — 회수한
 * 상품이나 잘못된 가격을 내려도 링크를 가진 사람에게는 계속 보인다.
 */
const VISIBLE = ['ACTIVE', 'SOLD_OUT'];

describe('스토어프론트가 거르는 조건', () => {
  it('추천 목록', async () => {
    await getFeaturedProducts(10);

    const where = db.product.findMany.mock.calls[0]![0].where;
    expect(where.status.in).toEqual(VISIBLE);
    expect(where.publishedAt).toEqual({ not: null });
    expect(where.deletedAt).toBeNull();
  });

  it('상품 상세 — 주소를 직접 쳐도 막혀야 한다', async () => {
    await getProductBySlug('oat-coat');

    const where = db.product.findFirst.mock.calls[0]![0].where;
    expect(where.status.in).toEqual(VISIBLE);
    expect(where.publishedAt).toEqual({ not: null });
  });

  it('정적 경로 생성 — 숨긴 상품의 주소를 만들지 않는다', async () => {
    await getAllProductSlugs();

    const where = db.product.findMany.mock.calls[0]![0].where;
    expect(where.status.in).toEqual(VISIBLE);
  });

  it('검수 대기와 숨김은 어디에도 들지 않는다', async () => {
    await Promise.all([
      getFeaturedProducts(10),
      getProductBySlug('oat-coat'),
      getAllProductSlugs(),
    ]);

    const wheres = [
      ...db.product.findMany.mock.calls.map((c: any[]) => c[0].where),
      ...db.product.findFirst.mock.calls.map((c: any[]) => c[0].where),
    ];
    expect(wheres).toHaveLength(3);
    for (const where of wheres) {
      expect(where.status.in).not.toContain('PENDING_REVIEW');
      expect(where.status.in).not.toContain('HIDDEN');
      expect(where.status.in).not.toContain('DRAFT');
    }
  });
});
