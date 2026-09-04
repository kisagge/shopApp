import { cache } from 'react';
import 'server-only';
import { prisma, Prisma } from '@shop/db';
import {
  discountRateOf, won, normalizeSearchTerm, normalizePriceRange, VISIBLE_STATUS,
  type Won, type ProductSort,
} from '@shop/core';

/**
 * 매대에 보이는 상품의 조건.
 *
 * **네 쿼리가 모두 이것을 쓴다.** 손으로 적어 두었더니 목록과 검색에는
 * 상태 조건이 있는데 상세와 정적 경로에는 빠져 있었다. 그래서 숨긴 상품이
 * 주소로는 그대로 열렸다 — 회수한 상품이나 잘못된 가격을 내려도 링크를
 * 가진 사람에게는 계속 보인다.
 */
const onDisplay = (): Prisma.ProductWhereInput => ({
  deletedAt: null,
  publishedAt: { not: null },
  // 배열을 복사해 넘긴다 — readonly 를 그대로 주면 Prisma 입력 타입과 어긋나고,
  // 그 여파로 select 추론이 통째로 무너진다(이 파일 아래쪽 주석과 같은 함정).
  status: { in: [...VISIBLE_STATUS] },
});

/**
 * 화면이 쓰는 모양. Prisma 모델을 그대로 컴포넌트에 넘기지 않는다 —
 * 스키마가 바뀔 때마다 화면이 따라 깨지고, 화면에 필요 없는 필드까지
 * 서버-클라이언트 경계를 넘어간다.
 */
export interface ProductListItem {
  readonly id: string;
  readonly slug: string;
  readonly brand: string;
  readonly name: string;
  readonly price: Won;
  readonly listPrice: Won | undefined;
  readonly discountPercent: number | undefined;
  readonly rating: number | undefined;
  readonly reviewCount: number;
  readonly soldOut: boolean;
  readonly isNew: boolean;
  readonly imageUrl: string | undefined;
  readonly imageAlt: string | undefined;
}

/** 등록 30일 이내면 NEW */
const NEW_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

const listSelect = {
  id: true,
  slug: true,
  name: true,
  listPrice: true,
  salePrice: true,
  ratingSum: true,
  reviewCount: true,
  publishedAt: true,
  brand: { select: { name: true } },
  images: { select: { url: true, alt: true }, orderBy: { sortOrder: 'asc' }, take: 1 },
  variants: { select: { stock: true }, where: { isActive: true } },
} as const;

/**
 * 팔 수 있는 브랜드 — 승인된 가맹점의 것이거나 자사 직매입(가맹점 없음).
 * 가맹점을 정지시켰는데 상품이 계속 팔리면 처분이 처분이 아니다.
 */
function sellableBrand() {
  return { OR: [{ merchantId: null }, { merchant: { status: 'APPROVED' as const } }] };
}

type ListRow = {
  id: string;
  slug: string; name: string; listPrice: number; salePrice: number | null;
  ratingSum: number; reviewCount: number; publishedAt: Date | null;
  brand: { name: string };
  images: { url: string; alt: string }[];
  variants: { stock: number }[];
};

function toListItem(p: ListRow, now: number): ProductListItem {
  const listPrice = won(p.listPrice);
  const price = p.salePrice === null ? listPrice : won(p.salePrice);
  // 표시 할인율은 저장하지 않고 두 값에서 계산한다
  const rate = discountRateOf(listPrice, price);

  const image = p.images[0];
  return {
    id: p.id,
    slug: p.slug,
    brand: p.brand.name,
    name: p.name,
    price,
    listPrice: rate > 0 ? listPrice : undefined,
    discountPercent: rate > 0 ? rate : undefined,
    // 리뷰가 없으면 평점을 만들어 내지 않는다. 0.0으로 표시하면 나쁜 상품처럼 보인다.
    rating: p.reviewCount > 0 ? p.ratingSum / p.reviewCount : undefined,
    reviewCount: p.reviewCount,
    soldOut: p.variants.length > 0 && p.variants.every((v) => v.stock <= 0),
    isNew: p.publishedAt !== null && now - p.publishedAt.getTime() < NEW_WINDOW_MS,
    imageUrl: image?.url,
    imageAlt: image?.alt,
  };
}

/** 홈 화면 — 많이 팔린 순 */
export async function getFeaturedProducts(limit = 8): Promise<ProductListItem[]> {
  const rows = await prisma.product.findMany({
    where: {
      ...onDisplay(),
      brand: sellableBrand(),
    },
    orderBy: [{ soldCount: 'desc' }, { publishedAt: 'desc' }],
    take: limit,
    select: listSelect,
  });
  const now = Date.now();
  return rows.map((r) => toListItem(r, now));
}


/** 헤더 내비게이션용 최상위 카테고리 */
/**
 * 헤더와 푸터가 같은 목록을 쓴다. cache 로 감싸 한 요청에 한 번만 읽는다 —
 * 감싸지 않으면 모든 페이지가 같은 질의를 두 번 던진다.
 */
export const getTopCategories = cache(
  async (): Promise<{ slug: string; name: string }[]> =>
    prisma.category.findMany({
      where: { parentId: null },
      orderBy: { sortOrder: 'asc' },
      select: { slug: true, name: true },
    }),
);

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
  readonly images: readonly { url: string; alt: string }[];
}

export async function getProductBySlug(slug: string): Promise<ProductDetail | null> {
  const p = await prisma.product.findFirst({
    where: {
      slug, ...onDisplay(),
      brand: sellableBrand(),
    },
    select: {
      id: true, slug: true, name: true, description: true,
      listPrice: true, salePrice: true, ratingSum: true, reviewCount: true,
      brand: { select: { name: true, slug: true } },
      category: { select: { name: true, slug: true } },
      images: { select: { url: true, alt: true }, orderBy: { sortOrder: 'asc' } },
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
  });
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


// ── 검색 · 필터 · 정렬 ────────────────────────────────────────

export interface CatalogFilter {
  readonly q?: string | undefined;
  readonly categorySlug?: string | undefined;
  readonly sort?: ProductSort | undefined;
  readonly minPrice?: number | undefined;
  readonly maxPrice?: number | undefined;
  readonly cursor?: string | undefined;
  readonly take?: number;
}

export interface CatalogPage {
  readonly items: readonly ProductListItem[];
  readonly nextCursor: string | null;
  /** 첫 쪽에서만 센다. 다음 쪽부터는 null — 화면이 들고 있던 값을 쓴다 */
  readonly total: number | null;
  /** 실제로 적용된 검색어. 너무 짧아 무시했으면 null */
  readonly term: string | null;
}

const PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 48;

/**
 * 정렬 축.
 *
 * **어느 정렬이든 id 를 마지막 축으로 붙인다.** 같은 값이 여럿이면 순서가
 * 요청마다 달라지고, 그러면 커서 페이지네이션이 행을 건너뛰거나 되풀이한다.
 */
function orderFor(sort: ProductSort) {
  switch (sort) {
    case 'newest':
      return [{ publishedAt: 'desc' as const }, { id: 'desc' as const }];
    case 'price_asc':
      return [{ sellingPrice: 'asc' as const }, { id: 'desc' as const }];
    case 'price_desc':
      return [{ sellingPrice: 'desc' as const }, { id: 'desc' as const }];
    case 'rating':
      // 리뷰가 없는 상품은 0 이라 자연히 뒤로 밀린다
      return [{ ratingScore: 'desc' as const }, { id: 'desc' as const }];
    default:
      return [{ soldCount: 'desc' as const }, { id: 'desc' as const }];
  }
}

/**
 * 목록 조회 — 검색어·카테고리·가격 범위·정렬을 한 곳에서 처리한다.
 *
 * 검색은 상품명과 브랜드명만 본다. 설명까지 넣으면 "울" 같은 흔한 낱말이
 * 본문에 스치기만 해도 걸려 결과가 탁해진다.
 *
 * 한글은 형태소 분석 없이 부분 일치로 찾는다. products.searchText 에 트라이그램
 * 색인을 걸어 두어 인덱스를 탄다. 더 나아가려면 검색 엔진이 필요하지만,
 * 그건 규모가 요구할 때 할 일이다.
 *
 * **전체 건수는 첫 쪽에서만 센다.** 카운트는 조건에 맞는 행을 전부 훑어야 해서
 * 매 쪽마다 돌리면 "더 보기" 한 번에 그 비용이 그대로 붙는다. 총 건수는
 * 첫 쪽에서 한 번 구해 화면이 들고 다니면 된다.
 */
export async function searchProducts(filter: CatalogFilter): Promise<CatalogPage> {
  const take = Math.min(filter.take ?? PAGE_SIZE, MAX_PAGE_SIZE);
  const sort = filter.sort ?? 'recommended';
  const term = filter.q ? normalizeSearchTerm(filter.q) : null;
  const range = normalizePriceRange({ min: filter.minPrice, max: filter.maxPrice });

  const categoryIds = filter.categorySlug ? await categoryIdsFor(filter.categorySlug) : null;
  // 카테고리를 지정했는데 찾지 못하면 전체를 보여 주지 않는다.
  // 잘못된 슬러그로 엉뚱한 목록을 내놓는 편이 빈 목록보다 나쁘다.
  if (filter.categorySlug && (categoryIds === null || categoryIds.length === 0)) {
    return { items: [], nextCursor: null, total: 0, term };
  }

  // 조건부 스프레드로 조립하면 선택 속성이 생겨 Prisma 입력 타입과 어긋나고
  // (exactOptionalPropertyTypes), 그 여파로 select 추론까지 무너진다.
  // 명시 타입에 하나씩 붙인다.
  const where: Prisma.ProductWhereInput = {
    ...onDisplay(),
    brand: sellableBrand(),
  };

  if (categoryIds) where.categoryId = { in: categoryIds };

  if (range.min !== null || range.max !== null) {
    const bounds: Prisma.IntFilter = {};
    if (range.min !== null) bounds.gte = range.min;
    if (range.max !== null) bounds.lte = range.max;
    where.sellingPrice = bounds;
  }

  if (term) {
    // 상품명과 브랜드명을 합쳐 둔 한 컬럼을 본다. 두 테이블에 OR 를 걸면
    // Postgres 가 어느 인덱스도 못 쓰고 전체를 훑는다.
    // 소문자로 저장해 두므로 여기서도 소문자로 맞춘다.
    where.searchText = { contains: term.toLowerCase() };
  }

  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: orderFor(sort),
      take: take + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      select: listSelect,
    }),
    // 첫 쪽에서만 센다. 커서가 있으면 이미 화면이 총 건수를 알고 있다.
    filter.cursor ? Promise.resolve(null) : prisma.product.count({ where }),
  ]);

  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;
  const now = Date.now();

  return {
    items: page.map((r) => toListItem(r, now)),
    nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
    total,
    term,
  };
}

/** 카테고리와 그 하위까지. 부모를 고르면 자식 상품도 나와야 한다. */
async function categoryIdsFor(slug: string): Promise<string[] | null> {
  const category = await prisma.category.findUnique({
    where: { slug },
    select: { id: true, children: { select: { id: true } } },
  });
  if (!category) return null;
  return [category.id, ...category.children.map((c) => c.id)];
}
