import { cache } from 'react';
import 'server-only';
import { cachedRead, TAG, TTL } from '~/lib/cache';
import { prisma } from '@shop/db';
import { discountRateOf, won, type Won } from '@shop/core';
import {
  onDisplay, sellableBrand, listSelect, toListItem, type ProductListItem,
} from './shelf';

/**
 * 홈 화면 — 많이 팔린 순.
 *
 * **행만 캐싱하고 화면 값은 매번 만든다.** toListItem 은 `now` 를 받아
 * "신상품" 여부를 정하는데, 그 결과까지 캐싱하면 캐시가 만들어진 시각에
 * 신상품이던 것이 계속 신상품으로 남는다.
 */
const featuredRows = cachedRead(
  (limit: number) =>
    prisma.product.findMany({
      where: { ...onDisplay(), brand: sellableBrand() },
      orderBy: [{ soldCount: 'desc' }, { publishedAt: 'desc' }],
      take: limit,
      select: listSelect,
    }),
  { key: ['featured-products'], tags: [TAG.catalog], revalidate: TTL.catalog },
);

export async function getFeaturedProducts(limit = 8): Promise<ProductListItem[]> {
  const rows = await featuredRows(limit);
  const now = Date.now();
  return rows.map((r) => toListItem(r, now));
}

/**
 * 헤더 내비게이션용 최상위 카테고리.
 *
 * **감싸개가 둘이고 하는 일이 다르다.**
 *
 * `cache` 는 한 요청 안의 중복만 막는다 — 헤더와 푸터가 같은 목록을 쓰므로,
 * 없으면 모든 화면이 같은 질의를 두 번 던진다. 그런데 **요청 사이에는 남지
 * 않는다.** 처음에는 이것만 감싸 두었고, 그래서 **모든 첫 요청이 이 질의로
 * DB 를 깨웠다.**
 *
 * 레이아웃에 있는 질의라 어느 화면을 열든 지나간다. 운영에서 재 보니 자는
 * DB 를 깨우는 데 1.5초가 들었고, 카탈로그 캐시를 한 시간으로 늘린 뒤에도
 * 홈이 3.7초였던 것이 이 자리 때문이었다 — 상품 상세는 0.3초로 떨어졌는데
 * 홈만 그대로였고, 그 뒤에 연 화면들이 빨라진 것이 단서였다.
 *
 * 그래서 `cachedRead` 로 한 겹 더 감싼다. 카테고리는 시드로 들어가고 고치는
 * 창구가 없어서 거의 바뀌지 않는다 — 캐시에 올리지 못할 이유가 없다.
 */
const topCategoryRows = cachedRead(
  async (): Promise<{ slug: string; name: string }[]> =>
    prisma.category.findMany({
      where: { parentId: null },
      orderBy: { sortOrder: 'asc' },
      select: { slug: true, name: true },
    }),
  { key: ['top-categories'], tags: [TAG.catalog], revalidate: TTL.catalog },
);

export const getTopCategories = cache(topCategoryRows);

/**
 * slug 목록으로 상품을 가져온다. 최근 본 상품이 쓴다.
 *
 * **캐싱하지 않는다.** 열쇠가 사람마다 다른 조합이라 캐시가 거의 맞지 않고,
 * 맞지 않는 캐시는 메모리만 먹는다.
 *
 * **보이는 상품 조건을 그대로 건다.** 어제 본 상품이 오늘 내려갔다면 오늘은
 * 보이지 않아야 한다 — 최근 본 목록이 숨긴 상품으로 들어가는 뒷문이 되면,
 * 상세 화면에 조건을 건 뜻이 없어진다.
 *
 * 준 순서대로 돌려준다. DB 는 순서를 지켜 주지 않는데, 이 목록에서는
 * **순서 자체가 내용이다** — 방금 본 것이 앞에 와야 한다.
 */
export async function getProductsBySlugs(
  slugs: readonly string[],
): Promise<ProductListItem[]> {
  if (slugs.length === 0) return [];

  const rows = await prisma.product.findMany({
    where: { slug: { in: [...slugs] }, ...onDisplay(), brand: sellableBrand() },
    select: listSelect,
  });

  const now = Date.now();
  const bySlug = new Map(rows.map((r) => [r.slug, toListItem(r, now)]));
  // 내려간 상품은 지도에 없으므로 자연히 빠진다
  return slugs.flatMap((slug) => {
    const item = bySlug.get(slug);
    return item ? [item] : [];
  });
}

// ── 상세 ──────────────────────────────────────────────────────

export interface ProductOptionValue {
  readonly id: string;
  readonly value: string;
  readonly swatchHex: string | null;
}

export interface ProductOptionGroup {
  readonly id: string;
  readonly name: string;
  readonly values: readonly ProductOptionValue[];
}

export interface ProductVariantView {
  readonly id: string;
  readonly sku: string;
  readonly label: string;
  readonly stock: number;
  /** 이 변형을 고르는 데 필요한 옵션 값 id 들 */
  readonly optionValueIds: readonly string[];
  readonly price: Won;
}

export interface ProductDetail {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly brand: string;
  readonly brandSlug: string;
  readonly categoryName: string;
  readonly categorySlug: string;
  readonly listPrice: Won;
  readonly price: Won;
  readonly discountPercent: number;
  readonly rating: number | undefined;
  readonly reviewCount: number;
  readonly soldOut: boolean;
  readonly optionGroups: readonly ProductOptionGroup[];
  readonly variants: readonly ProductVariantView[];
  readonly images: readonly {
    url: string;
    alt: string;
    blurDataUrl: string | null;
    /** 우리가 찍지 않은 사진의 출처. 없으면 표기하지 않는다. */
    credit: string | null;
    creditUrl: string | null;
  }[];
}

const productRow = cachedRead(
  (slug: string) =>
    prisma.product.findFirst({
    where: {
      slug, ...onDisplay(),
      brand: sellableBrand(),
    },
    select: {
      id: true, slug: true, name: true, description: true,
      listPrice: true, salePrice: true, ratingSum: true, reviewCount: true,
      brand: { select: { name: true, slug: true } },
      category: { select: { name: true, slug: true } },
      images: {
        select: { url: true, alt: true, blurDataUrl: true, credit: true, creditUrl: true },
        orderBy: { sortOrder: 'asc' },
      },
      optionGroups: {
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true, name: true,
          values: {
            orderBy: { sortOrder: 'asc' },
            select: { id: true, value: true, swatchHex: true },
          },
        },
      },
      variants: {
        where: { isActive: true },
        select: {
          id: true, sku: true, label: true, stock: true, priceOverride: true,
          optionValues: { select: { id: true } },
        },
      },
    },
  }),
  { key: ['product-detail'], tags: [TAG.catalog], revalidate: TTL.catalog },
);

/**
 * 상품 상세.
 *
 * 행 읽기만 캐싱한다. 이 함수는 **사용자와 무관한 값만** 돌려주므로 캐싱해도
 * 안전하다 — 찜 여부·내 리뷰인지·알림 신청 여부는 화면이 따로 읽고, 그것들은
 * 캐시에 들어가지 않는다.
 *
 * 재고는 최대 TTL 만큼 늦는다. 목록에서 잠깐 늦게 품절로 바뀔 뿐이고,
 * 주문을 만들 때 서버가 재고를 다시 보므로 초과 판매로 이어지지 않는다.
 */
export async function getProductBySlug(slug: string): Promise<ProductDetail | null> {
  const p = await productRow(slug);
  if (!p) return null;

  const listPrice = won(p.listPrice);
  const price = p.salePrice === null ? listPrice : won(p.salePrice);

  return {
    id: p.id, slug: p.slug, name: p.name, description: p.description,
    brand: p.brand.name, brandSlug: p.brand.slug,
    categoryName: p.category.name, categorySlug: p.category.slug,
    listPrice,
    price,
    discountPercent: discountRateOf(listPrice, price),
    rating: p.reviewCount > 0 ? p.ratingSum / p.reviewCount : undefined,
    reviewCount: p.reviewCount,
    soldOut: p.variants.length > 0 && p.variants.every((v) => v.stock <= 0),
    optionGroups: p.optionGroups,
    variants: p.variants.map((v) => ({
      id: v.id, sku: v.sku, label: v.label, stock: v.stock,
      optionValueIds: v.optionValues.map((o) => o.id),
      // 옵션별 가격 차이가 있으면 그 값을, 없으면 상품 판매가를 쓴다
      price: v.priceOverride === null ? price : won(v.priceOverride),
    })),
    images: p.images,
  };
}

/** 상세 페이지의 정적 경로 생성에 쓴다 */
export async function getAllProductSlugs(): Promise<string[]> {
  const rows = await prisma.product.findMany({
    where: onDisplay(),
    select: { slug: true },
  });
  return rows.map((r) => r.slug);
}

/** 카테고리 트리 — 목록 페이지의 사이드바 */
export async function getCategoryWithChildren(slug: string) {
  return prisma.category.findUnique({
    where: { slug },
    select: {
      id: true, name: true, slug: true,
      parent: { select: { name: true, slug: true } },
      children: { select: { name: true, slug: true }, orderBy: { sortOrder: 'asc' } },
    },
  });
}

/**
 * 옛 주소로 들어왔을 때 갈 곳.
 *
 * **찾지 못했을 때만 부른다.** 지금 주소를 먼저 보는 이유는 되돌린 경우
 * 때문이다 — a → b → a 로 돌아오면 a 는 지금 주소이면서 기록에도 남아
 * 있을 수 있고, 기록을 먼저 보면 자기 자신으로 넘기는 고리가 생긴다.
 *
 * **매대 조건을 건다.** 내려간 상품으로 넘기면 404 를 두 번 거치게 할 뿐이다.
 */
export const getProductSlugMovedTo = cachedRead(
  async (slug: string): Promise<string | null> => {
    const row = await prisma.productSlug.findFirst({
      // 매대 조건은 거르는 조건이지 고르는 필드가 아니다
      where: { slug, product: { ...onDisplay(), brand: sellableBrand() } },
      select: { product: { select: { slug: true } } },
    });
    return row?.product.slug ?? null;
  },
  { key: ['product-slug-moved'], tags: [TAG.catalog], revalidate: TTL.catalog },
);
