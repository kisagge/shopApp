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

/**
 * 검색어를 낱말로 쪼갠다.
 *
 * **붙어 있어야만 찾던 것을 고친다.** 예전에는 검색어 전체를 한 덩어리로
 * 보고 `searchText` 안에 그 문자열이 통째로 들어 있는지만 봤다. 그래서
 * "블렌드 코트" 는 1건을 찾는데 **"울 코트" 는 0건**이었다 — "오버사이즈 울
 * 블렌드 코트" 안에 두 낱말이 다 있는데도 사이에 다른 말이 끼어 있었기
 * 때문이다. 낱말 순서를 바꾼 "코트 울" 도 마찬가지였다.
 *
 * 한국어로 물건을 찾을 때 "울 코트" 는 아주 자연스러운 말이다. 그것이 0건이면
 * 손님은 안 파는 물건이라고 읽는다.
 *
 * **모두 들어 있어야 한다(AND).** 하나라도 걸리면 내놓는 방식(OR)으로 하면
 * "코트 바지" 가 매대를 통째로 가져온다 — 좁히려고 낱말을 더했는데 넓어진다.
 *
 * **한 글자짜리는 버린다** — 단, 그 한 글자로 뜻이 서는 문자(한글 음절·한자·
 * 가나)는 남긴다. `normalizeSearchTerm` 이 검색어 전체에 대해 쓰는 것과 같은
 * 잣대다. "울" 은 낱말이고 "s" 는 아니다.
 *
 * 남는 낱말이 없으면 원래 검색어를 그대로 한 낱말로 본다 — 무엇이든 찾아
 * 보려던 사람에게 빈손으로 답하지 않는다.
 */
export const MAX_SEARCH_WORDS = 6;

export function searchWords(term: string): string[] {
  const words = term
    .toLowerCase()
    .split(' ')
    .filter((w) => w.length > 0)
    .filter((w) => w.length >= MIN_SEARCH_LENGTH || standsAlone(w))
    .slice(0, MAX_SEARCH_WORDS);

  return words.length > 0 ? words : [term.toLowerCase()];
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

/**
 * 가격 구간 프리셋.
 *
 * **숫자 두 칸만 두면 흔한 일이 가장 번거롭다.** "10만원 아래로 보고 싶다"
 * 는 이 화면에서 가장 자주 하는 일인데, 그러려면 칸을 찾아 눌러 숫자를
 * 치고 적용까지 세 걸음이었다. 한 번 누르면 끝나야 하는 종류다.
 *
 * **사다리를 매대에 맞춰 흔들지 않는다.** 카테고리마다 구간이 달라지면
 * 같은 자리에 다른 값이 오고, 어제 누른 것을 오늘 못 찾는다. 지금 매대가
 * 29,000 ~ 419,000 이라 이 다섯이면 어느 칸도 비지 않는다.
 *
 * id 는 주소에 그대로 실린다. 값이 아니라 이름이라 나중에 경계를 조정해도
 * 예전 링크가 깨지지 않는다.
 */
export const PRICE_BUCKET = [
  { id: 'under-100k', min: null, max: 99_999 },
  { id: '100k-200k', min: 100_000, max: 199_999 },
  { id: '200k-300k', min: 200_000, max: 299_999 },
  { id: 'over-300k', min: 300_000, max: null },
] as const;

export type PriceBucketId = (typeof PRICE_BUCKET)[number]['id'];

export const PRICE_BUCKET_IDS = PRICE_BUCKET.map((b) => b.id) as readonly PriceBucketId[];

export function isPriceBucketId(value: string): value is PriceBucketId {
  return PRICE_BUCKET_IDS.includes(value as PriceBucketId);
}

/** 구간 이름을 실제 범위로 편다. 모르는 이름은 범위가 없는 것과 같다. */
export function priceBucketRange(
  id: string,
): { id: PriceBucketId; min: number | null; max: number | null } | null {
  return PRICE_BUCKET.find((b) => b.id === id) ?? null;
}

/**
 * 화면이 받은 세 값에서 실제로 걸 범위를 정한다.
 *
 * **어느 쪽이 이기는지 한 곳에서만 정한다.** 질의와 화면이 각자 판단하면
 * 언젠가 갈라진다 — 목록은 좁혀졌는데 눌린 칩은 다른 것을 가리키는 식이다.
 *
 * 손으로 친 숫자가 이긴다. 빈 칸은 "안 정했다" 로 들어오므로, 숫자가 있다는
 * 것은 사람이 그 값을 직접 넣었다는 뜻이다. 그때는 프리셋 칩도 눌리지 않은
 * 것으로 그린다 — 눌린 칩과 다른 범위가 걸려 있으면 화면이 거짓말을 한다.
 */
export function resolvePriceRange(input: {
  minPrice?: number | undefined;
  maxPrice?: number | undefined;
  price?: string | undefined;
}): { min: number | null; max: number | null; bucket: string | null } {
  const typed = input.minPrice !== undefined || input.maxPrice !== undefined;
  if (typed) {
    return { min: input.minPrice ?? null, max: input.maxPrice ?? null, bucket: null };
  }

  const bucket = input.price === undefined ? null : priceBucketRange(input.price);
  if (bucket === null) return { min: null, max: null, bucket: null };

  return { min: bucket.min, max: bucket.max, bucket: bucket.id };
}
