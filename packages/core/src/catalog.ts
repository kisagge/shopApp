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
 * 앞뒤 공백과 가운데 연속 공백을 정리한다.
 *
 * **한 글자를 거절하던 규칙이 한국어에서는 틀렸다.** 근거는 "카탈로그 전체가
 * 걸려 검색이라 부를 수 없다" 였는데, 그건 라틴 문자 이야기다 — `a` 는 거의
 * 모든 것에 걸린다. 한글은 **한 글자가 낱말**이다: 울 · 백 · 컵 · 톱.
 *
 * 실제로 "울" 은 상품 서른넷 중 여덟에 걸린다. 카탈로그 전체가 아니라 쓸 만한
 * 결과인데, 손님에게는 아무것도 없다고 나갔다.
 *
 * 낱자(ㄱ, ㅏ)는 여전히 거절한다 — **조합 중이라는 뜻**이지 낱말이 아니다.
 * 한자와 가나도 한 글자로 뜻이 서므로 함께 받는다.
 */
export const MIN_SEARCH_LENGTH = 2;
export const MAX_SEARCH_LENGTH = 60;

/**
 * 한 글자로도 뜻이 서는 문자.
 *
 * 완성된 한글 음절 · 한자 · 가나. **낱자 영역(U+3131–U+318E)은 뺐다** —
 * 한글 자판에서 조합 중에 나오는 값이라, 받으면 글자를 치는 동안 뜻 없는
 * 검색이 계속 나간다.
 */
const STANDS_ALONE = /[\uAC00-\uD7A3\u4E00-\u9FFF\u3040-\u30FF]/u;

/**
 * 이 한 글자만으로 찾을 만한가.
 *
 * **내보내는 이유가 있다.** 검색과 자동완성은 서로 다른 질문에 답한다 —
 * "검색어로 쓸 수 있는가" 와 "제안을 시작할 만큼 쳤는가". 두 문지기를 따로
 * 두는 것은 맞지만, **한 음절이 낱말이라는 사실에는 둘이 다르게 답하면
 * 안 된다.** 실제로 그랬다. 검색은 `울` 로 여덟 개를 찾는데 자동완성은
 * 아무것도 내놓지 않아, 치는 동안에는 안 파는 물건처럼 보였다.
 */
export function standsAlone(term: string): boolean {
  return STANDS_ALONE.test(term);
}

export function normalizeSearchTerm(raw: string): string | null {
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (trimmed.length === 0) return null;
  if (trimmed.length < MIN_SEARCH_LENGTH && !standsAlone(trimmed)) return null;
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

/**
 * 실제로 파는 가격.
 *
 * 파생값인데도 컬럼으로 저장한다 — Prisma 는 COALESCE 로 정렬하지 못하고,
 * 가져와서 JS 로 정렬하면 커서 페이지네이션이 깨진다. 인덱스도 못 건다.
 *
 * **searchTextFor 와 똑같은 이유로 여기 있다.** 그때는 규칙이 어드민 쓰기
 * 경로에만 있어서 시드가 검색 칸을 비워 뒀고, 갓 시드한 DB 에서 검색이
 * 아무것도 못 찾았다. 이 칸은 같은 실수가 한 번 더 났다 — 시드가 안 쓰니
 * 기본값 0 으로 남았고, 서른넷 중 스물여섯이 `가격 10만원 이상` 에서
 * 사라졌다. 파는 가격이 0 이니 조건에 걸릴 리가 없다.
 *
 * 파생 규칙은 파생값을 쓰는 모든 경로가 같은 것을 봐야 한다. 그래서 여기다.
 */
export function sellingPriceOf(input: { listPrice: number; salePrice: number | null }): number {
  return input.salePrice ?? input.listPrice;
}
