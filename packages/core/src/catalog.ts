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

/*
 * 정렬 이름표는 여기 없다.
 *
 * 예전에는 이 옆에 한국어 이름이 있었는데, 화면이 세 나라 말로 나가게 되면서
 * 그 자리가 맞지 않게 됐다. core 는 요청도 언어도 모르는 순수한 규칙 묶음이다.
 * 무엇으로 정렬할 수 있는지는 여기가 정하고, 그것을 뭐라고 부를지는 화면이
 * 정한다 — apps/web 의 CatalogControls 에 있다.
 */

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
 *
 * **문장이 아니라 이유를 돌려준다.** 예전에는 여기서 한국어 문장을 만들었는데,
 * 화면이 세 나라 말로 나가면서 자리가 맞지 않게 됐다 — 게다가 "가격 범위와
 * 카테고리를" 처럼 낱말을 이어 붙이는 방식은 조사와 어순이 다른 말로 옮길 수
 * 없다. 무엇이 원인인지 판단하는 것은 규칙이라 여기 남고, 그것을 어떻게
 * 말할지는 화면이 정한다.
 */
export const EMPTY_RESULT_REASON = [
  'widen_price',
  'widen_category',
  'widen_both',
  'other_term',
  'no_products',
] as const;

export type EmptyResultReason = (typeof EMPTY_RESULT_REASON)[number];

export function emptyResultReason(applied: {
  hasQuery: boolean;
  hasPriceRange: boolean;
  hasCategory: boolean;
}): EmptyResultReason {
  if (applied.hasPriceRange && applied.hasCategory) return 'widen_both';
  if (applied.hasPriceRange) return 'widen_price';
  if (applied.hasCategory) return 'widen_category';
  if (applied.hasQuery) return 'other_term';
  return 'no_products';
}

/**
 * 검색 대상 문자열.
 *
 * 브랜드명을 상품 행에 복사해 둔다 — 검색 OR 가 두 테이블에 걸치면 인덱스를
 * 못 쓴다. 소문자로 저장해 비교 때 대소문자를 신경 쓰지 않는다.
 *
 * **여기 둔 이유가 있다.** 예전에는 어드민 쓰기 경로에만 있어서 **시드가
 * 이 칸을 비워 두었고, 갓 시드한 DB 에서는 검색이 아무것도 못 찾았다** —
 * 검색 명세가 결과를 확인하지 않아 아무도 몰랐다. 쓰는 곳이 둘이면 규칙도
 * 한 곳에 있어야 한다.
 */
export function searchTextFor(input: { name: string; brandName: string }): string {
  return `${input.name} ${input.brandName}`.toLowerCase();
}
