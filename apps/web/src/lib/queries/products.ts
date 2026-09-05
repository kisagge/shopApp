import { cache } from 'react';
import 'server-only';
import { cachedRead, TAG, TTL } from '~/lib/cache';
import { prisma, Prisma } from '@shop/db';
import { mergeRecommendations } from '@shop/core';
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
  ratingSum: number; reviewCount: number;
  /**
   * 캐시를 지나므로 **Date 가 아니라 문자열**로 올 수 있다.
   *
   * 캐시는 값을 JSON 으로 저장한다. Date 로 선언해 두었더니 캐싱을 붙인
   * 순간 홈이 통째로 500 이 났다 — getTime is not a function.
   */
  publishedAt: Date | string | null;
  brand: { name: string };
  images: { url: string; alt: string }[];
  variants: { stock: number }[];
};

/** 캐시를 지나온 값은 문자열일 수 있다. 양쪽을 같게 다룬다. */
const epochOf = (value: Date | string): number =>
  value instanceof Date ? value.getTime() : new Date(value).getTime();

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
    isNew: p.publishedAt !== null && now - epochOf(p.publishedAt) < NEW_WINDOW_MS,
    imageUrl: image?.url,
    imageAlt: image?.alt,
  };
}

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
  readonly images: readonly {
    url: string;
    alt: string;
    /** 우리가 찍지 않은 사진의 출처. 없으면 표기하지 않는다. */
    credit: string | null;
    creditUrl: string | null;
  }[];
}

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

/**
 * 이 상품을 본 사람이 함께 본 것.
 *
 * 같은 세션에서 본 상품을 짝지어 세고, 많이 겹친 순으로 준다.
 *
 * **원본 이벤트를 직접 읽는다.** 미리 접어 두는 표를 만들 수도 있지만,
 * 지금 규모에서는 배치 하나와 표 하나를 더 두는 값이 없다. 대신 창을 30일로
 * 자른다 — 오래된 취향은 지금 추천에 도움이 안 되고, 원본은 90일 뒤 롤업이
 * 지우므로 이 창은 늘 안에 있다.
 *
 * **여기서는 매대 조건을 걸지 않는다.** id 만 세고, 실제 상품은 아래에서
 * 매대 조건과 함께 다시 읽는다 — 조건을 두 곳에 적으면 한쪽만 낡는다.
 */
const COVIEW_WINDOW_DAYS = 30;

const coViewedIds = cachedRead(
  async (productId: string, limit: number): Promise<string[]> => {
    const since = new Date(Date.now() - COVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const rows = await prisma.$queryRaw<{ productId: string }[]>`
      select other."productId" as "productId"
      from event_logs mine
      join event_logs other
        on other."sessionId" = mine."sessionId"
       and other."productId" is not null
       and other."productId" <> mine."productId"
       and other.name = 'view_item'
      where mine.name = 'view_item'
        and mine."productId" = ${productId}
        and mine."receivedAt" >= ${since}
      group by other."productId"
      order by count(distinct other."sessionId") desc, other."productId" asc
      limit ${limit}
    `;
    return rows.map((r) => r.productId);
  },
  { key: ['co-viewed'], tags: [TAG.catalog], revalidate: TTL.catalog },
);

/**
 * 추천으로 보여 줄 상품.
 *
 * 함께 본 기록을 앞에 두고, 모자라면 **같은 카테고리의 잘 팔리는 것**으로
 * 채운다. 기록은 사람이 다녀가야 쌓이므로 새 상품에는 없고, 문을 연 직후에는
 * 어느 상품에도 없다 — 그때마다 자리가 사라지면 있는지 없는지를 사용자가
 * 예측할 수 없다.
 */
export interface Recommendations {
  readonly items: readonly ProductListItem[];
  /**
   * 함께 본 기록이 실제로 들어갔는가.
   *
   * **제목이 이 값에 따라 달라진다.** 인기 상품으로 채운 줄에 "함께 본 상품"
   * 이라고 붙이면 사실이 아닌 말을 하는 것이다 — 추천은 근거를 말할 때만
   * 믿을 만하다.
   */
  readonly fromCoView: boolean;
}

export async function getRecommendations(input: {
  readonly productId: string;
  readonly categorySlug: string;
  readonly limit: number;
}): Promise<Recommendations> {
  const { productId, categorySlug, limit } = input;

  // 걸러질 것을 감안해 넉넉히 뽑는다. 숨긴 상품이 섞이면 그만큼 줄어든다.
  const over = limit * 2;
  const [ids, shelfIds] = await Promise.all([
    coViewedIds(productId, over),
    shelfIdsFor(categorySlug),
  ]);

  const [primaryRows, shelfRows, popularRows] = await Promise.all([
    ids.length === 0 ? [] : onDisplayByIds(ids),
    shelfIds.length === 0 ? [] : shelfBestSellers(shelfIds, over),
    /*
     * 마지막 단. 매대까지 봐도 모자랄 때가 있다 — 상품이 하나뿐인 갈래가
     * 그렇다. 실제로 여덟 상품 중 넷에서 줄이 통째로 사라졌다.
     */
    getFeaturedProducts(over),
  ]);

  const now = Date.now();

  /*
   * 함께 본 순서는 위에서 정해졌는데 DB 는 그 순서를 지켜 주지 않는다.
   * 최근 본 상품에서와 같은 이유로 여기서 다시 세운다.
   */
  const bySlot = new Map(primaryRows.map((r) => [r.id, r]));
  const primary = ids.flatMap((id) => {
    const row = bySlot.get(id);
    return row ? [toListItem(row, now)] : [];
  });

  const items = mergeRecommendations({
    primary,
    fallback: [...shelfRows.map((r) => toListItem(r, now)), ...popularRows],
    excludeId: productId,
    limit,
  });

  const coViewed = new Set(primary.map((p) => p.id));
  return { items, fromCoView: items.some((i) => coViewed.has(i.id)) };
}

const onDisplayByIds = (ids: readonly string[]) =>
  prisma.product.findMany({
    where: { id: { in: [...ids] }, ...onDisplay(), brand: sellableBrand() },
    select: listSelect,
  });

/**
 * 같은 **매대**의 잘 팔리는 것.
 *
 * 잎 카테고리만 보면 안 된다 — 코트에는 코트가 하나뿐이라 자기 자신을
 * 빼고 나면 아무것도 남지 않는다. 실제로 그렇게 만들었더니 여덟 상품 중
 * 넷에서 추천 줄이 통째로 사라졌다.
 *
 * 그래서 **같은 상위 카테고리 전체**로 본다. 사람이 "아우터 더 보기" 라고
 * 생각하는 범위가 그쪽이지, "코트 더 보기" 가 아니다.
 */
const shelfIdsFor = cachedRead(
  async (categorySlug: string): Promise<string[]> => {
    const category = await prisma.category.findUnique({
      where: { slug: categorySlug },
      select: { id: true, parentId: true, children: { select: { id: true } } },
    });
    if (!category) return [];

    // 상위가 있으면 그 상위와 형제들, 없으면 자기와 자식들
    if (category.parentId === null) {
      return [category.id, ...category.children.map((c) => c.id)];
    }
    const siblings = await prisma.category.findMany({
      where: { parentId: category.parentId },
      select: { id: true },
    });
    return [category.parentId, ...siblings.map((c) => c.id)];
  },
  { key: ['shelf-ids'], tags: [TAG.catalog], revalidate: TTL.catalog },
);

const shelfBestSellers = cachedRead(
  (categoryIds: readonly string[], limit: number) =>
    prisma.product.findMany({
      where: {
        ...onDisplay(),
        brand: sellableBrand(),
        categoryId: { in: [...categoryIds] },
      },
      orderBy: [{ soldCount: 'desc' }, { publishedAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: listSelect,
    }),
  { key: ['shelf-best'], tags: [TAG.catalog], revalidate: TTL.catalog },
);

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
        select: { url: true, alt: true, credit: true, creditUrl: true },
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

  /*
   * **검색어가 있으면 캐싱하지 않는다.**
   *
   * 캐시 키에 검색어가 들어가면 키 공간이 무한해진다 — 아무 말이나 넣어
   * 두드리면 캐시가 쓰레기로 찬다. 카테고리·정렬·가격대는 화면이 만들 수
   * 있는 조합이 한정돼 있어 캐싱해도 안전하다.
   */
  const { rows, total } = await (term === null ? cachedCatalogPage : catalogPage)({
    categoryIds, min: range.min, max: range.max, term,
    sort, take, cursor: filter.cursor ?? null,
  });

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

interface CatalogQuery {
  readonly categoryIds: string[] | null;
  readonly min: number | null;
  readonly max: number | null;
  readonly term: string | null;
  readonly sort: ProductSort;
  readonly take: number;
  readonly cursor: string | null;
}

/**
 * 목록 한 쪽을 읽는다.
 *
 * where 조립을 이 안에 둔 이유는 **캐시 키가 인자에서 나오기 때문**이다.
 * 조립된 where 객체를 넘기면 키가 그 객체의 모양에 따라 흔들린다.
 */
async function catalogPage(q: CatalogQuery) {
  // 조건부 스프레드로 조립하면 선택 속성이 생겨 Prisma 입력 타입과 어긋나고
  // (exactOptionalPropertyTypes), 그 여파로 select 추론까지 무너진다.
  // 명시 타입에 하나씩 붙인다.
  const where: Prisma.ProductWhereInput = {
    ...onDisplay(),
    brand: sellableBrand(),
  };

  if (q.categoryIds) where.categoryId = { in: q.categoryIds };

  if (q.min !== null || q.max !== null) {
    const bounds: Prisma.IntFilter = {};
    if (q.min !== null) bounds.gte = q.min;
    if (q.max !== null) bounds.lte = q.max;
    where.sellingPrice = bounds;
  }

  if (q.term) {
    // 상품명과 브랜드명을 합쳐 둔 한 컬럼을 본다. 두 테이블에 OR 를 걸면
    // Postgres 가 어느 인덱스도 못 쓰고 전체를 훑는다.
    // 소문자로 저장해 두므로 여기서도 소문자로 맞춘다.
    where.searchText = { contains: q.term.toLowerCase() };
  }

  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: orderFor(q.sort),
      take: q.take + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      select: listSelect,
    }),
    // 첫 쪽에서만 센다. 커서가 있으면 이미 화면이 총 건수를 알고 있다.
    q.cursor ? Promise.resolve(null) : prisma.product.count({ where }),
  ]);

  return { rows, total };
}

const cachedCatalogPage = cachedRead(catalogPage, {
  key: ['catalog-page'],
  tags: [TAG.catalog],
  revalidate: TTL.catalog,
});

/** 카테고리와 그 하위까지. 부모를 고르면 자식 상품도 나와야 한다. */
const categoryIdsFor = cachedRead(
  async (slug: string): Promise<string[] | null> => {
    const category = await prisma.category.findUnique({
      where: { slug },
      select: { id: true, children: { select: { id: true } } },
    });
    if (!category) return null;
    return [category.id, ...category.children.map((c) => c.id)];
  },
  { key: ['category-ids'], tags: [TAG.catalog], revalidate: TTL.catalog },
);
