import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 주문 줄에서 상품 화면으로 가는 링크.
 *
 * 산 물건의 화면으로 갈 길이 없어 검색부터 해야 했다. 다만 **내린 상품으로 가는 링크는 404 로 끝나는 막다른 길**이라
 * 매대와 같은 조건으로 거른 상품에만 건다. 조건을 따로 적지 않고 매대의 것(onDisplay·sellableBrand)을 그대로 쓰는지 본다.
 */

const findMany = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/db', () => ({ prisma: { product: { findMany } }, Prisma: {} }));

const { getDisplayedProductSlugs } = await import('~/lib/queries/orders');
const { onDisplay, sellableBrand } = await import('~/lib/queries/catalog/shelf');

beforeEach(() => {
  findMany.mockReset().mockResolvedValue([]);
});

describe('매대에 나와 있는 상품의 주소', () => {
  it('매대와 같은 조건으로 거른다 — 내린 상품·정지된 가맹점 상품에는 링크를 걸지 않는다', async () => {
    await getDisplayedProductSlugs(['p-1']);

    expect(findMany.mock.calls[0]![0].where).toEqual({
      id: { in: ['p-1'] },
      ...onDisplay(),
      brand: sellableBrand(),
    });
  });

  it('같은 상품을 여러 줄에 샀어도 한 번만 묻는다', async () => {
    await getDisplayedProductSlugs(['p-1', 'p-1', 'p-2']);
    expect(findMany.mock.calls[0]![0].where.id).toEqual({ in: ['p-1', 'p-2'] });
  });

  it('상품 id 로 주소를 찾게 돌려준다 — 걸러진 상품은 없다', async () => {
    findMany.mockResolvedValue([{ id: 'p-1', slug: 'wool-coat' }]);

    const slugs = await getDisplayedProductSlugs(['p-1', 'p-gone']);

    expect(slugs.get('p-1')).toBe('wool-coat');
    expect(slugs.has('p-gone')).toBe(false);
  });

  it('줄이 없으면 묻지 않는다', async () => {
    expect((await getDisplayedProductSlugs([])).size).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });
});
