import { won, type Won } from './money';

/**
 * 목록 정렬과 필터 규칙. 순수 로직만.
 */

export const PRODUCT_SORT = [
  'recommended',
  'newest',
  'price_asc',
  'price_desc',
  'rating',
] as const;
export type ProductSort = (typeof PRODUCT_SORT)[number];

export const PRODUCT_SORT_LABEL: Readonly<Record<ProductSort, string>> = {
  recommended: '추천순',
  newest: '신상품순',
  price_asc: '낮은 가격순',
  price_desc: '높은 가격순',
  rating: '평점순',
};

export const DEFAULT_SORT: ProductSort = 'recommended';

export function isProductSort(value: string): value is ProductSort {
  return (PRODUCT_SORT as readonly string[]).includes(value);
}

/**
 * 검색어 정규화.
 *
 * 앞뒤 공백과 가운데 연속 공백을 정리한다. 한 글자는 받지 않는다 —
 * 카탈로그 전체가 걸려 검색이라 부를 수 없는 결과가 나온다.
 */
export const MIN_SEARCH_LENGTH = 2;
export const MAX_SEARCH_LENGTH = 60;

export function normalizeSearchTerm(raw: string): string | null {
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (trimmed.length < MIN_SEARCH_LENGTH) return null;
  return trimmed.slice(0, MAX_SEARCH_LENGTH);
}

export interface PriceRange {
  readonly min: Won | null;
  readonly max: Won | null;
}

/**
 * 가격 범위 정리.
 *
 * 뒤집힌 범위(최소 > 최대)는 **거절하지 않고 바로잡는다.** 슬라이더나 두 칸
 * 입력에서 흔히 나오는 상태이고, 여기서 막으면 사용자는 왜 결과가 없는지
 * 알 수 없다. 서로 바꿔 주는 편이 의도에 가깝다.
 */
export function normalizePriceRange(input: {
  min?: number | null | undefined;
  max?: number | null | undefined;
}): PriceRange {
  const min = toBound(input.min);
  const max = toBound(input.max);

  if (min !== null && max !== null && min > max) {
    return { min: max, max: min };
  }
  return { min, max };
}

function toBound(value: number | null | undefined): Won | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value < 0) return null;
  return won(Math.floor(value));
}

/**
 * 검색 결과가 비었을 때 무엇을 풀어 보라고 안내할지.
 *
 * "결과 없음" 만 보여 주면 사용자는 검색어를 의심하지만, 실제로는 필터를
 * 좁혀 놓은 경우가 더 많다. 무엇을 풀면 되는지 짚어 준다.
 */
export function emptyResultHint(applied: {
  hasQuery: boolean;
  hasPriceRange: boolean;
  hasCategory: boolean;
}): string {
  const filters: string[] = [];
  if (applied.hasPriceRange) filters.push('가격 범위');
  if (applied.hasCategory) filters.push('카테고리');

  if (filters.length > 0) {
    return `${filters.join('와 ')}를 넓혀 보세요.`;
  }
  if (applied.hasQuery) {
    return '다른 검색어를 써 보시거나 철자를 확인해 주세요.';
  }
  return '아직 등록된 상품이 없습니다.';
}
