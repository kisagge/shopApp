import 'server-only';
import { cachedRead, TAG, TTL } from '~/lib/cache';
import { prisma, Prisma } from '@shop/db';
import {
  DEFAULT_SORT,
  normalizeSearchTerm, normalizePriceRange, FACET_GROUP, EMPTY_FACETS, sortFacetValues,
  type ProductSort, type Facets, type FacetValue, type FacetKey,
} from '@shop/core';
import {
  onDisplay, sellableBrand, searchWhere, listSelect, toListItem, type ProductListItem,
} from './shelf';

export interface CatalogFilter {
  readonly q?: string | undefined;
  readonly categorySlug?: string | undefined;
  readonly brandSlug?: string | undefined;
  /** 브랜드 화면이 아닌 곳에서 브랜드로 좁힐 때. brandSlug 와 함께 쓰지 않는다. */
  readonly brands?: readonly string[] | undefined;
  readonly color?: readonly string[] | undefined;
  readonly size?: readonly string[] | undefined;
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
  // 기본값은 core 가 정한다. 여기 글자로 적어 두면 core 를 고쳐도 검색만 옛 값으로 남는다.
  const sort = filter.sort ?? DEFAULT_SORT;
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
    categoryIds,
    brandSlug: filter.brandSlug ?? null,
    brands: [...(filter.brands ?? [])],
    color: [...(filter.color ?? [])],
    size: [...(filter.size ?? [])],
    min: range.min, max: range.max, term,
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
  readonly brandSlug: string | null;
  readonly brands: string[];
  readonly color: string[];
  readonly size: string[];
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
  /*
   * 브랜드는 두 가지 방식으로 온다. 브랜드 화면은 주소로 하나를 고정하고,
   * 다른 화면은 좁혀 보기로 여럿을 고른다. **둘을 겹쳐 쓰지 않는다** —
   * 브랜드 화면 안에서 또 브랜드를 고르는 것은 뜻이 없고, 겹치면 어느
   * 쪽이 이기는지 화면마다 달라진다.
   */
  if (q.brandSlug) where.brand = { ...sellableBrand(), slug: q.brandSlug };
  else if (q.brands.length > 0) where.brand = { ...sellableBrand(), slug: { in: q.brands } };

  /*
   * **색상과 사이즈는 같은 변형에서 만나야 한다.**
   *
   * 따로 걸면 "블랙이 있고 M 도 있는 상품" 이 걸린다 — 블랙은 L 만 있고
   * M 은 흰색뿐인 상품이 "블랙 M" 검색에 나온다. 고른 사람이 원한 것은
   * 블랙 M 하나다.
   *
   * **재고는 보지 않는다.** 거르지 않은 목록도 품절 상품을 보여 주는데,
   * 필터만 더 엄격하면 규칙이 두 벌이 된다 — 색으로 좁혔다고 품절이
   * 사라지면 사용자는 왜 없어졌는지 알 수 없다. 품절 여부는 카드가 이미
   * 말해 주고, 빼고 보고 싶으면 그건 따로 둘 스위치다.
   */
  const optionMatch = [
    { name: FACET_GROUP.color, values: q.color },
    { name: FACET_GROUP.size, values: q.size },
  ]
    .filter((f) => f.values.length > 0)
    .map((f) => ({ optionValues: { some: { value: { in: f.values }, group: { name: f.name } } } }));

  if (optionMatch.length > 0) {
    where.variants = { some: { isActive: true, AND: optionMatch } };
  }

  if (q.min !== null || q.max !== null) {
    const bounds: Prisma.IntFilter = {};
    if (q.min !== null) bounds.gte = q.min;
    if (q.max !== null) bounds.lte = q.max;
    where.sellingPrice = bounds;
  }

  if (q.term) {
    Object.assign(where, searchWhere(q.term));
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

/* ─────────────────────────────────────────── 필터 축 */

/**
 * 지금 범위에서 고를 수 있는 색상·사이즈.
 *
 * **고른 색상·사이즈는 범위에서 뺀다.** 넣으면 블랙을 고른 순간 다른 색이
 * 목록에서 사라져 되돌릴 길이 없어진다. 카테고리와 검색어까지만 반영한다.
 */
const facetRows = cachedRead(
  async (categoryIds: string[] | null, brandSlug: string | null, term: string | null) => {
    const scope: Prisma.ProductWhereInput = { ...onDisplay(), brand: sellableBrand() };
    if (categoryIds) scope.categoryId = { in: categoryIds };
    if (brandSlug) scope.brand = { ...sellableBrand(), slug: brandSlug };
    if (term) Object.assign(scope, searchWhere(term));

    return prisma.productOptionValue.findMany({
      where: {
        group: {
          name: { in: [FACET_GROUP.color, FACET_GROUP.size] },
          product: scope,
        },
      },
      select: {
        value: true,
        swatchHex: true,
        group: { select: { name: true } },
      },
      /*
       * 값의 순번은 **그 상품 안에서만** 뜻이 있다 — 옵션 그룹이 상품마다
       * 따로 있기 때문이다. 상세 화면에서는 그 순번이 맞지만, 여러 상품의
       * 값을 한 목록으로 접는 여기서는 쓸 수 없다. 그래서 뽑지도 않는다.
       * 여기서 정렬하는 것은 같은 값을 먼저 만나는 행을 고정하기 위한
       * 것뿐이고, 화면에 놓일 차례는 fold 안에서 core 가 정한다.
       */
      orderBy: { value: 'asc' },
    });
  },
  { key: ['facets'], tags: [TAG.catalog], revalidate: TTL.catalog },
);

export interface BrandOption {
  readonly slug: string;
  readonly name: string;
}

/**
 * 이 매대에 실제로 물건이 있는 브랜드.
 *
 * **고를 수 있는 것만 보여 준다** — 색·사이즈와 같은 규칙이다. 카테고리에
 * 없는 브랜드를 띄우면 누른 사람은 빈 화면을 만나고, 그것이 이 기능에서
 * 가장 나쁜 상태다.
 *
 * 브랜드가 아니라 **상품** 쪽에서 센다. 브랜드 테이블을 훑고 상품 유무를
 * 따로 묻는 것보다, 지금 보이는 상품들의 브랜드를 접는 편이 조건이 하나로
 * 유지된다.
 */
const brandRows = cachedRead(
  async (categoryIds: string[] | null, term: string | null) => {
    const where: Prisma.ProductWhereInput = { ...onDisplay(), brand: sellableBrand() };
    if (categoryIds) where.categoryId = { in: categoryIds };
    if (term) Object.assign(where, searchWhere(term));

    const rows = await prisma.product.findMany({
      where,
      select: { brand: { select: { slug: true, name: true } } },
      distinct: ['brandId'],
      orderBy: { brand: { name: 'asc' } },
    });
    return rows.map((r) => r.brand);
  },
  { key: ['brand-facets'], tags: [TAG.catalog], revalidate: TTL.catalog },
);

export async function getBrandOptions(filter: {
  categorySlug?: string | undefined;
  q?: string | undefined;
}): Promise<BrandOption[]> {
  const categoryIds = filter.categorySlug ? await categoryIdsFor(filter.categorySlug) : null;
  if (filter.categorySlug && (categoryIds === null || categoryIds.length === 0)) return [];

  const term = filter.q ? normalizeSearchTerm(filter.q) : null;
  const brands = await brandRows(categoryIds, term);

  /*
   * 하나뿐이면 축으로 두지 않는다. 고를 것이 하나인 좁혀 보기는 누르나 마나
   * 같은 목록이라, 자리만 차지하고 고르는 일을 늘린다.
   */
  return brands.length > 1 ? brands : [];
}

export async function getFacets(filter: {
  categorySlug?: string | undefined;
  brandSlug?: string | undefined;
  q?: string | undefined;
}): Promise<Facets> {
  const categoryIds = filter.categorySlug ? await categoryIdsFor(filter.categorySlug) : null;
  if (filter.categorySlug && (categoryIds === null || categoryIds.length === 0)) {
    return EMPTY_FACETS;
  }

  const term = filter.q ? normalizeSearchTerm(filter.q) : null;
  const rows = await facetRows(categoryIds, filter.brandSlug ?? null, term);

  /*
   * 같은 값이 상품마다 따로 있으므로 여기서 접는다. DB 에 distinct 를
   * 맡기면 스와치 색을 함께 가져올 수 없다.
   *
   * 차례는 DB 가 정해 주지 못한다. 옵션 값의 순번은 **그 상품 안에서의
   * 순번**이라, 여러 상품을 접으면 뜻을 잃는다. 매대 전체의 차례는
   * core 가 안다.
   */
  const fold = (key: FacetKey): FacetValue[] => {
    const groupName = FACET_GROUP[key];
    const seen = new Map<string, FacetValue>();
    for (const row of rows) {
      if (row.group.name !== groupName || seen.has(row.value)) continue;
      seen.set(row.value, { value: row.value, swatchHex: row.swatchHex });
    }
    return sortFacetValues(key, [...seen.values()]);
  };

  return { color: fold('color'), size: fold('size') };
}
