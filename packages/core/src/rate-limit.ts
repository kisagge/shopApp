/**
 * 요청 제한 정책.
 *
 * **여기에는 세는 코드가 없다.** 얼마나 허용할지와 남은 시간을 어떻게 셈할지만
 * 정한다 — 정책은 core, 실행은 바깥이라는 이 저장소의 결이다.
 *
 * 인증 경로는 Better Auth 가 자체 제한을 갖고 있다. 여기서 다루는 것은 그
 * 밖의 **로그인 없이도 두드릴 수 있는 쓰기 창구**다.
 */

export interface RateLimitPolicy {
  /** 창 하나에서 허용하는 횟수 */
  readonly limit: number;
  /** 창 길이(ms) */
  readonly windowMs: number;
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;

/**
 * 창구마다 다른 값을 쓴다.
 *
 * 한 값으로 묶으면 어느 쪽이든 틀린다 — 이벤트 수집은 화면을 한 번 보는
 * 동안에도 여러 번 오지만, 쿠폰 발급은 사람이 한 번 누르는 동작이다.
 */
export const RATE_LIMIT = {
  /**
   * 분석 이벤트. 페이지 이동·조회·담기가 모두 여기로 온다.
   * 넉넉하게 두되, 스크립트가 테이블을 불리는 것은 막는다.
   */
  events: { limit: 120, windowMs: MINUTE },

  /**
   * 장바구니 견적. 수량을 바꿀 때마다 다시 계산한다.
   */
  quote: { limit: 60, windowMs: MINUTE },

  /**
   * 리뷰 작성. 사람이 글을 쓰는 동작이라 분당 몇 번이면 충분하다.
   * 사진이 붙으면 업로드까지 따라오므로 더더욱 촘촘할 이유가 없다.
   */
  review: { limit: 5, windowMs: MINUTE },

  /**
   * 쿠폰 발급. **선착순 쿠폰을 스크립트가 쓸어 가는 것**을 막는 자리다.
   * 초과 발급 자체는 원자적 갱신이 막지만, 남보다 빨리 여러 장을 집는 것은
   * 그것으로 막히지 않는다.
   */
  coupon: { limit: 10, windowMs: MINUTE },

  /**
   * 리뷰 신고. 사유를 고르고 누르는 동작이라 잦을 이유가 없다.
   *
   * 여기가 헐거우면 **신고가 곧 소음**이 된다 — 대기줄이 한 사람의 클릭으로
   * 채워지면 운영진이 진짜 건을 못 찾는다. 같은 리뷰 중복은 유니크 제약이
   * 막지만, 여러 리뷰를 훑으며 누르는 것은 그것으로 막히지 않는다.
   */
  report: { limit: 10, windowMs: MINUTE },

  /**
   * 상품 문의. 사람이 글을 쓰는 동작이라 리뷰와 같은 결이다.
   * 조금 더 여유를 두는 것은 사기 전에 여러 상품을 놓고 묻는 일이 있어서다.
   */
  inquiry: { limit: 8, windowMs: MINUTE },
} as const satisfies Record<string, RateLimitPolicy>;

export type RateLimitSurface = keyof typeof RATE_LIMIT;

/** 한 열쇠의 현재 상태 */
export interface RateLimitState {
  /** 이 창에서 지금까지 센 횟수 */
  readonly count: number;
  /** 창이 시작된 시각 */
  readonly windowStart: number;
}

export interface RateLimitResult {
  readonly allowed: boolean;
  /** 이번 요청까지 포함한 상태. 저장소에 그대로 다시 넣는다. */
  readonly next: RateLimitState;
  /** 남은 허용 횟수 */
  readonly remaining: number;
  /** 다시 시도해도 되는 시각까지의 초. 허용됐으면 0 */
  readonly retryAfterSeconds: number;
}

/**
 * 한 요청을 센다.
 *
 * **고정 창(fixed window)이다.** 슬라이딩 창이 더 고르지만 요청마다 시각
 * 목록을 들고 있어야 하고, 그 목록이 곧 메모리다. 창 경계에서 두 배까지
 * 몰릴 수 있다는 것을 알고 고른다 — 여기서 막으려는 것은 정교한 공격이
 * 아니라 **끊임없이 두드리는 것**이다.
 */
export function consume(
  state: RateLimitState | undefined,
  now: number,
  policy: RateLimitPolicy,
): RateLimitResult {
  const fresh = !state || now - state.windowStart >= policy.windowMs;
  const windowStart = fresh ? now : state.windowStart;
  const count = (fresh ? 0 : state.count) + 1;

  const allowed = count <= policy.limit;
  const elapsed = now - windowStart;

  return {
    allowed,
    next: { count, windowStart },
    remaining: Math.max(0, policy.limit - count),
    // 올림한다. 0.2초 남았는데 0 을 주면 곧바로 다시 두드린다.
    retryAfterSeconds: allowed ? 0 : Math.ceil((policy.windowMs - elapsed) / SECOND),
  };
}

/** 오래된 상태인가. 저장소를 비울 때 쓴다. */
export function isExpired(
  state: RateLimitState,
  now: number,
  policy: RateLimitPolicy,
): boolean {
  return now - state.windowStart >= policy.windowMs;
}
