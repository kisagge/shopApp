import 'server-only';
import { prisma } from '@shop/db';
import {
  DEFAULT_SHIPPING, discountRateOf, gte, won,
  type ComparableProduct,
} from '@shop/core';
import { onDisplay, sellableBrand } from './shelf';

/**
 * 견줄 상품들을 읽는다.
 *
 * **화면이 넘긴 차례를 지킨다.** DB 는 `in` 절의 차례를 지켜 주지 않는데,
 * 비교표는 사람이 담은 차례대로 서 있어야 한다 — 두 번째 칸이 매번 다른
 * 상품이면 눈이 따라가지 못한다.
 *
 * **없는 slug 는 조용히 빠진다.** 담아 둔 사이에 상품이 내려갈 수 있고,
 * 그때 비교표 전체를 오류로 만들 이유는 없다. 남은 것으로 견주면 된다.
 */
export interface CompareItem extends ComparableProduct {
  readonly name: string;
  readonly imageUrl: string | undefined;
  readonly imageAlt: string | undefined;
  readonly blurDataUrl: string | undefined;
}

export async function getComparableProducts(
  slugs: readonly string[],
): Promise<CompareItem[]> {
  if (slugs.length === 0) return [];

  const rows = await prisma.product.findMany({
    where: {
      slug: { in: [...slugs] },
      ...onDisplay(),
      brand: sellableBrand(),
    },
    select: {
      slug: true,
      name: true,
      listPrice: true,
      salePrice: true,
      ratingSum: true,
      reviewCount: true,
      brand: { select: { name: true } },
      category: { select: { slug: true } },
      images: {
        orderBy: { sortOrder: 'asc' },
        take: 1,
        select: { url: true, alt: true, blurDataUrl: true },
      },
      variants: { where: { isActive: true }, select: { stock: true } },
      optionGroups: {
        orderBy: { sortOrder: 'asc' },
        select: {
          name: true,
          values: { orderBy: { sortOrder: 'asc' }, select: { value: true } },
        },
      },
    },
  });

  const bySlug = new Map(rows.map((row) => [row.slug, row]));

  return slugs.flatMap((slug) => {
    const row = bySlug.get(slug);
    if (row === undefined) return [];

    const listPrice = won(row.listPrice);
    const price = row.salePrice === null ? listPrice : won(row.salePrice);
    const rate = discountRateOf(listPrice, price);
    const image = row.images[0];

    const options: Record<string, string[]> = {};
    for (const group of row.optionGroups) {
      options[group.name] = group.values.map((v) => v.value);
    }

    return [
      {
        slug: row.slug,
        name: row.name,
        categorySlug: row.category.slug,
        brand: row.brand.name,
        price,
        listPrice: rate > 0 ? listPrice : undefined,
        discountPercent: rate > 0 ? rate : undefined,
        // 리뷰가 없으면 평점을 만들어 내지 않는다. 0.0 으로 두면 나쁜 상품처럼 보인다.
        rating: row.reviewCount > 0 ? row.ratingSum / row.reviewCount : undefined,
        reviewCount: row.reviewCount,
        soldOut: row.variants.length > 0 && row.variants.every((v) => v.stock <= 0),
        /*
         * 이 상품 하나만 샀을 때 무료배송인지. 장바구니 합계가 아니라 상품
         * 값으로 판단하는 이유는, 비교표가 **이 상품을 살지**를 정하는
         * 자리이기 때문이다 — 함께 담을 것을 아직 모른다.
         */
        freeShipping:
          DEFAULT_SHIPPING.freeThreshold !== null && gte(price, DEFAULT_SHIPPING.freeThreshold),
        options,
        imageUrl: image?.url,
        imageAlt: image?.alt,
        blurDataUrl: image?.blurDataUrl ?? undefined,
      } satisfies CompareItem,
    ];
  });
}
