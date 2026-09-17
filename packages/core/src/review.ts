import type { OrderStatus } from './order-state';
import { MAX_IMAGES_PER_REVIEW } from './image';
import { hasPermission, type Actor } from './authz';

/**
 * 리뷰 규칙. 순수 로직만.
 */

/**
 * 리뷰를 쓸 수 있는 사람인가.
 *
 * **파는 사람은 이 매대의 평을 쓰지 않는다.** `review:write` 는 처음부터 고객과
 * 운영진에게만 줬는데(authz), **어디서도 검사하지 않았다** — 34개 권한 중 유일하게
 * 강제 지점이 0인 권한이었다. 선언만 하고 연결하지 않으면 없는 규칙이다.
 *
 * 열어 두면 가맹점이 **자기 상품을 사서 자기가 별 다섯을 쓴다.** 그 별점은
 * 상품 정렬 점수(ratingScore)로 곧장 들어가 매대의 차례를 바꾸고, 리뷰 적립금까지
 * 자기가 받는다. 남의 브랜드도 마찬가지다 — 경쟁 상품에 혹평을 남길 수 있다.
 *
 * **자기 상품만 막지 않는다.** 파는 사람의 계정으로 쓴 평은 그것이 무엇인지 아무도
 * 확신할 수 없다. 손님으로 살 일이 있으면 손님 계정으로 산다.
 *
 * 이미 써 둔 평을 고치는 것은 막지 않는다 — 쓰지 못하게 하는 것이지, 자기가 한 말을
 * 거두지 못하게 하는 것이 아니다. 가맹점이 되기 전에 쓴 평이 그렇다.
 */
export const canWriteReview = (actor: Actor): boolean => hasPermission(actor, 'review:write');

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

export interface ReviewImageRef {
  readonly id: string;
  readonly storageKey: string;
}

export interface ReviewImagePlan {
  /** 남길 사진 — 화면에 보이던 차례 그대로다 */
  readonly keep: readonly ReviewImageRef[];
  /** 뺄 사진. 저장소에서도 지울 대상이라 키까지 들고 나간다 */
  readonly remove: readonly ReviewImageRef[];
  /** 남길 것 + 새로 올릴 것 */
  readonly total: number;
  readonly overLimit: boolean;
}

/**
 * 리뷰를 고칠 때 사진을 어떻게 갈아 끼울지.
 *
 * **화면이 보내는 것은 "남길 것" 이지 "뺄 것" 이 아니다.** 뺄 것을 받으면 화면이 보고 있던 목록과 서버의 목록이 어긋났을 때
 * 엉뚱한 사진이 지워진다 — 다른 탭에서 먼저 한 장을 뺀 경우가 그렇다. 남길 것만 받으면 그 어긋남은 "이미 없는 것을 남기라고
 * 했다" 가 되어 조용히 넘어간다.
 *
 * 모르는 id 는 무시한다. 남의 사진 id 를 끼워 넣어도 이 리뷰의 사진이 아니면 애초에 keep 에 들어오지 않는다.
 */
export function planReviewImages(
  existing: readonly ReviewImageRef[],
  keepIds: readonly string[],
  addingCount: number,
  max: number = MAX_IMAGES_PER_REVIEW,
): ReviewImagePlan {
  const wanted = new Set(keepIds);
  const keep = existing.filter((image) => wanted.has(image.id));
  const remove = existing.filter((image) => !wanted.has(image.id));
  const total = keep.length + addingCount;

  return { keep, remove, total, overLimit: total > max };
}

/**
 * 고친 글인가.
 *
 * **저장을 눌렀다는 것만으로 "수정됨" 을 붙이지 않는다.** 아무것도 안 바꾸고 나온 사람에게까지 그 표시가 붙으면, 표시를 보고
 * "내가 읽은 것과 다른 글일 수 있다" 고 판단하는 사람을 헛되게 만든다. 표시는 실제로 달라졌을 때만 뜻이 있다.
 */
export function reviewChanged(
  before: Readonly<Record<string, unknown>>,
  after: Readonly<Record<string, unknown>>,
  imagesChanged = false,
): boolean {
  if (imagesChanged) return true;
  return Object.entries(after).some(([field, value]) => value !== undefined && before[field] !== value);
}

export const REVIEW_ERROR = [
  'NOT_PURCHASED',
  'NOT_DELIVERED',
  'ALREADY_REVIEWED',
  'REVIEW_NOT_FOUND',
  'NOT_OWN_REVIEW',
  /** 파는 사람의 계정이다 — canWriteReview 를 보라 */
  'SELLER_CANNOT_REVIEW',
] as const;
export type ReviewErrorCode = (typeof REVIEW_ERROR)[number];

export const REVIEW_ERROR_MESSAGE: Readonly<Record<ReviewErrorCode, string>> = {
  NOT_PURCHASED: '구매한 상품에만 리뷰를 쓸 수 있습니다',
  NOT_DELIVERED: '배송이 완료된 뒤에 쓸 수 있습니다',
  ALREADY_REVIEWED: '이미 리뷰를 쓴 주문입니다',
  REVIEW_NOT_FOUND: '리뷰를 찾을 수 없습니다',
  NOT_OWN_REVIEW: '자기 리뷰만 고칠 수 있습니다',
  SELLER_CANNOT_REVIEW: '판매자 계정으로는 리뷰를 쓸 수 없습니다. 손님으로 사신 것이라면 개인 계정으로 써 주세요.',
};

/**
 * 주문 상세의 줄마다 후기로 가는 길.
 *
 * **주문을 보다가 후기를 쓰러 갈 길이 없었다.** 받은 물건을 확인하는 자리가 곧 후기를 떠올리는 자리인데, 마이페이지의
 * 다른 메뉴로 가서 그 줄을 다시 찾아야 했다. 쓴 것이 있으면 고치러, 없으면 쓰러 보낸다.
 *
 * · `WRITE` — 받았고(isReviewableStatus) 줄이 살아 있고 아직 안 썼다
 * · `EDIT`  — 이미 썼고 운영진이 내리지 않았다(내린 글은 고치는 화면이 없는 글로 답한다)
 * · null    — 받기 전이거나 돌려보낸 줄이거나, 운영진이 내린 후기다(다시 쓸 수도 없다 — assertCanReview)
 */
export type OrderLineReviewLink =
  | { readonly kind: 'WRITE' }
  | { readonly kind: 'EDIT'; readonly reviewId: string }
  | null;

export function orderLineReviewLink(input: {
  readonly orderStatus: OrderStatus;
  /** 취소·환불로 돈이 돌아간 줄 */
  readonly lineCanceled: boolean;
  /** 이 줄로 쓴 후기. 행이 없으면 null(본인이 지운 것도 행이 없다) */
  readonly review: { readonly id: string; readonly deletedAt: Date | null } | null;
}): OrderLineReviewLink {
  if (input.review) {
    return input.review.deletedAt === null ? { kind: 'EDIT', reviewId: input.review.id } : null;
  }
  if (input.lineCanceled || !isReviewableStatus(input.orderStatus)) return null;
  return { kind: 'WRITE' };
}
