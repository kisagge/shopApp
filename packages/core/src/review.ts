import type { OrderStatus } from './order-state';

/**
 * 리뷰 규칙. 순수 로직만.
 */

export const RATING_MIN = 1;
export const RATING_MAX = 5;

export const SIZE_FIT = ['SMALL', 'TRUE', 'LARGE'] as const;
export type SizeFit = (typeof SIZE_FIT)[number];

/*
 * 사이즈 표현의 이름표는 여기 없다.
 *
 * 무엇이 있는지는 규칙이고 뭐라고 부를지는 화면이다. 화면이 세 나라 말로
 * 나가면서 이 자리의 한국어 표는 맞지 않게 됐다 — apps/web 의
 * lib/i18n/enum-labels 가 값 목록에서 열쇠를 만들고, 사전이 세 벌로 가진다.
 */

export function isSizeFit(value: string): value is SizeFit {
  return (SIZE_FIT as readonly string[]).includes(value);
}

/**
 * 리뷰를 쓸 수 있는 주문 상태.
 *
 * 배송이 끝나야 쓴다. 결제만 하고 받지도 않은 물건에 후기를 쓰게 두면
 * 그 후기는 상품이 아니라 기대에 대한 것이 된다.
 */
/**
 * **내보낸다.** 조회는 불리언이 아니라 목록이 필요하다 — Prisma 의
 * `status: { in: [...] }` 에 그대로 들어간다.
 *
 * 내보내지 않았더니 리뷰 쓸 것 목록(`getReviewableItems`)과 마이페이지 배지가
 * 각자 `['DELIVERED', 'CONFIRMED']` 를 손으로 적었다. 값이 같아서 조용했지만,
 * 여기 규칙을 바꾸면 **쓰기만 바뀌고 보여주는 쪽은 안 바뀐다** — 화면이
 * "리뷰 쓰기" 를 권했는데 누르면 409 가 된다.
 */
export const REVIEWABLE_STATUS: readonly OrderStatus[] = ['DELIVERED', 'CONFIRMED'];

export function isReviewableStatus(status: OrderStatus): boolean {
  return REVIEWABLE_STATUS.includes(status);
}

/**
 * 평균 평점.
 *
 * 리뷰가 없으면 **0 이 아니라 undefined** 다. 0.0 으로 표시하면 나쁜 상품처럼
 * 보이는데, 실제로는 아직 아무도 쓰지 않은 것뿐이다.
 */
export function averageRating(sum: number, count: number): number | undefined {
  if (count <= 0) return undefined;
  return sum / count;
}

/**
 * 정렬용 평균 — 정수로 눌러 저장한다.
 *
 * 소수를 그대로 두면 컬럼 타입이 실수가 되고, 실수 비교로 정렬하면 같은
 * 평점끼리의 순서가 미세한 오차로 흔들린다. 100 배 정수(4.35 → 435)로 둔다.
 */
export function ratingScore(sum: number, count: number): number {
  if (count <= 0) return 0;
  return Math.round((sum / count) * 100);
}

export interface RatingBreakdown {
  readonly rating: number;
  readonly count: number;
  /** 전체에서 차지하는 비율(0~100, 내림) */
  readonly percent: number;
}

/**
 * 별점 분포. 5점부터 1점까지 **빠짐없이** 돌려준다.
 *
 * 개수가 0 인 점수를 빼 버리면 막대그래프에 구멍이 생겨, 아무도 준 적 없는
 * 점수와 그래프가 짧은 점수를 구분할 수 없다.
 */
export function ratingBreakdown(counts: Readonly<Record<number, number>>): RatingBreakdown[] {
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const result: RatingBreakdown[] = [];
  for (let rating = RATING_MAX; rating >= RATING_MIN; rating -= 1) {
    const count = counts[rating] ?? 0;
    result.push({
      rating,
      count,
      percent: total === 0 ? 0 : Math.floor((count / total) * 100),
    });
  }
  return result;
}

export interface SizeFitSummary {
  readonly fit: SizeFit;
  readonly count: number;
  readonly percent: number;
}

/**
 * 사이즈 분포.
 *
 * 옷을 살 때 별점보다 실질적으로 쓸모 있는 정보다. 답하지 않은 리뷰는
 * 분모에서도 뺀다 — 무응답을 "정사이즈"로 세면 분포가 거짓이 된다.
 */
export function sizeFitSummary(fits: readonly (string | null)[]): SizeFitSummary[] {
  const answered = fits.filter((f): f is SizeFit => f !== null && isSizeFit(f));
  const total = answered.length;

  return SIZE_FIT.map((fit) => {
    const count = answered.filter((f) => f === fit).length;
    return { fit, count, percent: total === 0 ? 0 : Math.round((count / total) * 100) };
  });
}

export const REVIEW_ERROR = [
  'NOT_PURCHASED',
  'NOT_DELIVERED',
  'ALREADY_REVIEWED',
  'REVIEW_NOT_FOUND',
  'NOT_OWN_REVIEW',
] as const;
export type ReviewErrorCode = (typeof REVIEW_ERROR)[number];

export const REVIEW_ERROR_MESSAGE: Readonly<Record<ReviewErrorCode, string>> = {
  NOT_PURCHASED: '구매한 상품에만 리뷰를 쓸 수 있습니다',
  NOT_DELIVERED: '배송이 완료된 뒤에 쓸 수 있습니다',
  ALREADY_REVIEWED: '이미 리뷰를 쓴 주문입니다',
  REVIEW_NOT_FOUND: '리뷰를 찾을 수 없습니다',
  NOT_OWN_REVIEW: '자기 리뷰만 고칠 수 있습니다',
};
