import { describe, it, expect, vi, beforeEach } from 'vitest';
import { won, VISIBLE_STATUS } from '@shop/core';
import { toListItem } from '~/lib/queries/catalog/shelf';

/**
 * 견줄 상품을 읽어 오는 일 — 차례, 빠진 것, 매대 조건, 그리고 카드가 쓰는 셈.
 *
 * 비교함은 담는 쪽(`compare-store`)과 그리는 쪽(`compare-ui`)만 검사가 있었고, **읽어 오는 쪽은 한 줄도 없었다.**
 * 여기서 틀리면 조용하다 — 비교표는 두 상품을 나란히 세우는 화면이라, 값이 조금 어긋나도 "이쪽이 더 싸구나" 로
 * 읽히고 만다.
 *
 * 특히 셋이 위험하다.
 *
 * - **차례.** DB 는 `in` 절의 차례를 지켜 주지 않는다. 두 번째 칸이 매번 다른 상품이면 눈이 못 따라간다.
 * - **품절.** `variants.length > 0 &&` 이 없으면 **아직 옵션을 안 만든 상품이 전부 품절로** 뜬다.
 * - **같은 셈.** 목록 카드(`toListItem`)와 같은 값을 다시 적어 두었다. 떨어뜨려 두면 한쪽만 고쳐지고,
 *   그때 목록에서는 20% 할인인 상품이 비교표에서는 정가로 선다.
 */

const db = vi.hoisted(() => ({
  product: { findMany: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db, Prisma: {} }));

const getShippingPolicy = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/shipping-policy', () => ({ getShippingPolicy }));

const { getComparableProducts } = await import('~/lib/queries/catalog/compare');

/** 한 줄의 바닥 — 검사마다 필요한 칸만 덮어 쓴다 */
const row = (over: Record<string, unknown> = {}) => ({
  id: 'p-coat',
  slug: 'wool-coat',
  name: '울 코트',
  listPrice: 390_000,
  salePrice: null,
  ratingSum: 0,
  reviewCount: 0,
  publishedAt: new Date('2026-01-01T00:00:00Z'),
  brand: { name: 'PLAIN' },
  category: { slug: 'coat' },
  images: [{ url: 'https://img/coat.webp', alt: '울 코트', blurDataUrl: 'data:blur' }],
  variants: [{ stock: 3 }],
  optionGroups: [
    { name: '색', values: [{ value: '검정' }, { value: '아이보리' }] },
    { name: '사이즈', values: [{ value: 'S' }, { value: 'M' }] },
  ],
  ...over,
});

const where = () => db.product.findMany.mock.calls[0]?.[0].where;
const first = async (over: Record<string, unknown> = {}) => {
  db.product.findMany.mockResolvedValue([row(over)]);
  const items = await getComparableProducts(['wool-coat']);
  return items[0]!;
};

beforeEach(() => {
  vi.clearAllMocks();
  db.product.findMany.mockResolvedValue([row()]);
  getShippingPolicy.mockResolvedValue({
    baseFee: won(3_000),
    freeThreshold: won(50_000),
    remoteSurcharge: won(3_000),
  });
});

describe('견줄 것이 없을 때', () => {
  it('빈 목록이면 아무것도 읽지 않는다', async () => {
    expect(await getComparableProducts([])).toEqual([]);
    expect(db.product.findMany).not.toHaveBeenCalled();
    expect(getShippingPolicy).not.toHaveBeenCalled();
  });
});

describe('차례', () => {
  it('화면이 넘긴 차례를 지킨다 — DB 가 뒤섞어 줘도', async () => {
    /*
     * `in` 절의 차례는 약속된 것이 아니다. 담은 차례대로 서지 않으면 비교표의 칸이
     * 새로고침마다 뒤바뀐다 — 같은 화면을 두 번 보면 다른 상품을 견주게 된다.
     */
    db.product.findMany.mockResolvedValue([
      row({ slug: 'knit', category: { slug: 'coat' } }),
      row({ slug: 'coat' }),
    ]);

    const items = await getComparableProducts(['coat', 'knit']);

    expect(items.map((i) => i.slug)).toEqual(['coat', 'knit']);
  });

  it('없는 slug 는 조용히 빠지고 나머지로 견준다', async () => {
    /*
     * 담아 둔 사이에 상품이 내려갈 수 있다. 그때 비교표 전체를 오류로 만들 이유가 없다 —
     * 남은 것으로 견주면 된다.
     */
    db.product.findMany.mockResolvedValue([row({ slug: 'coat' })]);

    const items = await getComparableProducts(['coat', '내려간-상품']);

    expect(items.map((i) => i.slug)).toEqual(['coat']);
  });
});

describe('매대에 보이는 것만', () => {
  it('내린 상품·숨긴 상품을 함께 거른다', async () => {
    await getComparableProducts(['wool-coat']);
    expect(where()).toMatchObject({
      deletedAt: null,
      publishedAt: { not: null },
      status: { in: [...VISIBLE_STATUS] },
    });
  });

  it('정지된 가맹점의 상품은 빠진다 — 처분이 처분이어야 한다', async () => {
    await getComparableProducts(['wool-coat']);
    expect(where().brand).toEqual({ OR: [{ merchantId: null }, { merchant: { status: 'APPROVED' } }] });
  });

  it('넘긴 slug 로만 찾는다', async () => {
    await getComparableProducts(['a', 'b']);
    expect(where().slug).toEqual({ in: ['a', 'b'] });
  });
});

describe('값과 할인', () => {
  it('판매가가 있으면 그것이 값이고, 정가는 취소선으로 함께 준다', async () => {
    const item = await first({ listPrice: 390_000, salePrice: 312_000 });
    expect(item.price).toBe(won(312_000));
    expect(item.listPrice).toBe(won(390_000));
    expect(item.discountPercent).toBe(20);
  });

  it('할인이 없으면 정가도 할인율도 비운다 — 0% 를 그리지 않는다', async () => {
    const item = await first({ listPrice: 390_000, salePrice: null });
    expect(item.price).toBe(won(390_000));
    expect(item.listPrice).toBeUndefined();
    expect(item.discountPercent).toBeUndefined();
  });

  it('판매가가 정가와 같아도 할인으로 적지 않는다', async () => {
    const item = await first({ listPrice: 390_000, salePrice: 390_000 });
    expect(item.discountPercent).toBeUndefined();
  });
});

describe('평점', () => {
  it('리뷰가 없으면 평점을 만들어 내지 않는다 — 0.0 은 나쁜 상품처럼 보인다', async () => {
    const item = await first({ reviewCount: 0, ratingSum: 0 });
    expect(item.rating).toBeUndefined();
    expect(item.reviewCount).toBe(0);
  });

  it('리뷰가 있으면 합을 수로 나눈다', async () => {
    const item = await first({ reviewCount: 4, ratingSum: 18 });
    expect(item.rating).toBe(4.5);
  });
});

describe('품절', () => {
  it('활성 옵션이 다 0 이면 품절', async () => {
    expect((await first({ variants: [{ stock: 0 }, { stock: 0 }] })).soldOut).toBe(true);
  });

  it('하나라도 남아 있으면 품절이 아니다', async () => {
    expect((await first({ variants: [{ stock: 0 }, { stock: 1 }] })).soldOut).toBe(false);
  });

  it('활성 옵션이 아예 없으면 품절이 아니다', async () => {
    /*
     * `every` 는 빈 배열에서 true 다. 앞의 `variants.length > 0` 이 없으면 **아직 옵션을
     * 안 만든 상품이 전부 품절로** 뜨고, 옵션을 다 끈 상품도 같은 자리에 선다.
     * 품절은 "다 팔렸다" 는 말인데, 그 둘은 아직 팔기 시작하지도 않은 것이다.
     */
    expect((await first({ variants: [] })).soldOut).toBe(false);
  });

  it('활성인 옵션만 읽어 온다', async () => {
    await getComparableProducts(['wool-coat']);
    expect(db.product.findMany.mock.calls[0]?.[0].select.variants.where).toEqual({ isActive: true });
  });
});

describe('무료배송', () => {
  /*
   * 비교표는 **이 상품을 살지**를 정하는 자리라 장바구니 합계가 아니라 상품 값으로 본다 —
   * 함께 담을 것을 아직 모른다. 그 대신 **기준은 결제와 같은 정책에서 읽는다**: 표시와
   * 실제 결제가 갈리면 손님은 결제 화면에서 배송비를 보고 멈춘다.
   */
  it('결제가 쓰는 정책을 읽는다', async () => {
    await getComparableProducts(['wool-coat']);
    expect(getShippingPolicy).toHaveBeenCalled();
  });

  it('기준과 같은 금액이면 무료', async () => {
    expect((await first({ listPrice: 50_000, salePrice: null })).freeShipping).toBe(true);
  });

  it('1원 모자라면 무료가 아니다', async () => {
    expect((await first({ listPrice: 49_999, salePrice: null })).freeShipping).toBe(false);
  });

  it('판매가로 본다 — 정가가 기준을 넘어도 깎인 값이 기준이다', async () => {
    expect((await first({ listPrice: 60_000, salePrice: 40_000 })).freeShipping).toBe(false);
  });

  it('무료배송을 안 하는 가게면 아무것도 무료가 아니다', async () => {
    getShippingPolicy.mockResolvedValue({ baseFee: won(3_000), freeThreshold: null, remoteSurcharge: won(3_000) });
    expect((await first({ listPrice: 1_000_000, salePrice: null })).freeShipping).toBe(false);
  });
});

describe('옵션과 사진', () => {
  it('옵션은 이름마다 값 목록으로 모은다', async () => {
    expect((await first()).options).toEqual({ 색: ['검정', '아이보리'], 사이즈: ['S', 'M'] });
  });

  it('옵션도 값도 정해진 차례로 읽어 온다 — 비교표의 두 칸이 같은 차례로 서야 한다', async () => {
    await getComparableProducts(['wool-coat']);
    const groups = db.product.findMany.mock.calls[0]?.[0].select.optionGroups;
    expect(groups.orderBy).toEqual({ sortOrder: 'asc' });
    expect(groups.select.values.orderBy).toEqual({ sortOrder: 'asc' });
  });

  it('옵션이 없는 상품은 빈 표', async () => {
    expect((await first({ optionGroups: [] })).options).toEqual({});
  });

  it('사진은 첫 장만', async () => {
    await getComparableProducts(['wool-coat']);
    expect(db.product.findMany.mock.calls[0]?.[0].select.images.take).toBe(1);
  });

  it('사진이 없으면 자리를 비운다', async () => {
    const item = await first({ images: [] });
    expect(item.imageUrl).toBeUndefined();
    expect(item.imageAlt).toBeUndefined();
    expect(item.blurDataUrl).toBeUndefined();
  });

  it('미리 보일 흐린 그림이 없으면 null 이 아니라 비운다 — 화면이 둘을 다르게 다룬다', async () => {
    const item = await first({ images: [{ url: 'https://img/x.webp', alt: 'x', blurDataUrl: null }] });
    expect(item.blurDataUrl).toBeUndefined();
  });
});

describe('목록 카드와 같은 셈을 쓴다', () => {
  /*
   * `shelf.ts` 는 "select 가 고르는 필드와 toListItem 이 읽는 필드가 같아야 한다 — 떨어뜨려 두면
   * 한쪽만 고쳐진다" 고 적어 두었다. 비교표는 그 셈을 **다시 적어** 두었으므로, 그 경고가 그대로
   * 여기에도 걸린다. 한쪽만 고치면 목록에서 20% 할인인 상품이 비교표에서는 정가로 선다.
   */
  it('값·할인·평점·품절이 카드와 한 글자도 다르지 않다', async () => {
    const source = row({ listPrice: 390_000, salePrice: 312_000, reviewCount: 4, ratingSum: 18, variants: [{ stock: 0 }] });
    db.product.findMany.mockResolvedValue([source]);

    const [item] = await getComparableProducts(['wool-coat']);
    const card = toListItem(source, Date.now());

    expect({
      price: item!.price,
      listPrice: item!.listPrice,
      discountPercent: item!.discountPercent,
      rating: item!.rating,
      reviewCount: item!.reviewCount,
      soldOut: item!.soldOut,
      brand: item!.brand,
      categorySlug: item!.categorySlug,
      imageUrl: item!.imageUrl,
      imageAlt: item!.imageAlt,
      blurDataUrl: item!.blurDataUrl,
    }).toEqual({
      price: card.price,
      listPrice: card.listPrice,
      discountPercent: card.discountPercent,
      rating: card.rating,
      reviewCount: card.reviewCount,
      soldOut: card.soldOut,
      brand: card.brand,
      categorySlug: card.categorySlug,
      imageUrl: card.imageUrl,
      imageAlt: card.imageAlt,
      blurDataUrl: card.blurDataUrl,
    });
  });
});
