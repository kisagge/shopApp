/**
 * 이벤트 분류와 퍼널 계산.
 *
 * 이벤트 이름은 GA4 권장 이커머스 이벤트를 그대로 쓴다. 우리 말로 새로 지으면
 * 나중에 GA4·PostHog 로 내보낼 때마다 매핑 표를 관리해야 한다.
 *
 * 이 파일에는 I/O 가 없다. 정책만 둔다.
 */

export const COMMERCE_EVENT = [
  'view_item_list',
  'view_item',
  'select_item',
  'add_to_cart',
  'remove_from_cart',
  'view_cart',
  'begin_checkout',
  'add_shipping_info',
  'add_payment_info',
  'purchase',
  'refund',
  'search',
  'add_to_wishlist',
  'share',
  'login',
  'sign_up',
  'page_view',
] as const;

export type CommerceEvent = (typeof COMMERCE_EVENT)[number];

/**
 * 장사가 아니라 **우리 화면이 얼마나 빠른가**를 재는 이벤트.
 *
 * COMMERCE_EVENT 에 섞지 않는다. 그 목록은 GA4 권장 이름을 그대로 따르기로
 * 한 것이고, 거기에 우리가 지은 이름을 끼우면 나중에 내보낼 때 매핑 표가
 * 다시 생긴다.
 */
export const DIAGNOSTIC_EVENT = ['web_vitals'] as const;
export type DiagnosticEvent = (typeof DIAGNOSTIC_EVENT)[number];

/** 브라우저가 보낼 수 있는 이벤트 이름 전부 */
export type EventName = CommerceEvent | DiagnosticEvent;

export const isCommerceEvent = (name: string): name is CommerceEvent =>
  (COMMERCE_EVENT as readonly string[]).includes(name);

/**
 * 브라우저가 보내면 버리는 이벤트.
 *
 * 매출이 걸린 이벤트를 클라이언트에서 받으면 누구나 curl 로 매출을 지어낼 수 있다.
 * 이 둘은 주문 확정·환불 처리 서버 코드에서만 기록한다.
 */
/**
 * 한 번에 보낼 수 있는 이벤트 수. 브라우저 트래커의 배치 크기와 맞춘다.
 *
 * **계약이 아니라 여기 둔다.** 계약 패키지는 Zod 를 끌고 오는데, 이 상수
 * 하나 때문에 브라우저 트래커가 계약을 import 하면서 **모든 화면이 Zod 를
 * 통째로 받고 있었다** — 폼이 하나도 없는 화면까지 384KB 씩. 상수는 정책이고
 * 스키마가 그것을 쓰는 것이지, 그 반대가 아니다.
 */
export const MAX_EVENTS_PER_BATCH = 20;

export const SERVER_ONLY_EVENT = ['purchase', 'refund'] as const;
export type ServerOnlyEvent = (typeof SERVER_ONLY_EVENT)[number];

export const isServerOnlyEvent = (name: string): name is ServerOnlyEvent =>
  (SERVER_ONLY_EVENT as readonly string[]).includes(name);

/**
 * 분석 동의 없이도 기록하는 이벤트.
 * 주문을 처리하고 문제를 추적하는 데 반드시 필요한 것들만 남긴다.
 */
export const ESSENTIAL_EVENT = ['purchase', 'refund', 'login', 'sign_up'] as const;

export const requiresConsent = (name: EventName): boolean =>
  !(ESSENTIAL_EVENT as readonly string[]).includes(name);

// ── 퍼널 ──────────────────────────────────────────────────────

/** 조회 → 담기 → 체크아웃 → 결제. 순서가 곧 정의다. */
export const FUNNEL_STEP = ['view_item', 'add_to_cart', 'begin_checkout', 'purchase'] as const;
export type FunnelStep = (typeof FUNNEL_STEP)[number];

export const FUNNEL_STEP_LABEL: Readonly<Record<FunnelStep, string>> = {
  view_item: '상품 조회',
  add_to_cart: '장바구니 담기',
  begin_checkout: '주문서 진입',
  purchase: '결제 완료',
};

/**
 * 가맹점이 보는 퍼널.
 *
 * **주문서 진입이 빠져 있다.** 그 단계는 장바구니 **전체**의 일이라 한
 * 가맹점에 귀속되지 않는다 — 남의 상품만 담고 주문서에 들어간 세션을
 * 우리 전환으로 세면 비율이 부풀고, 반대로 우리 상품이 섞여 있었다고
 * 세면 남의 전환을 우리 것으로 읽는다. 어느 쪽도 맞지 않으므로 뺀다.
 *
 * 대신 **결제는 주문에서 센다.** purchase 이벤트는 주문 하나에 하나뿐이라
 * 가맹점을 달 수 없다(한 주문에 여러 가맹점이 섞인다). 주문 항목에는
 * 가맹점이 찍혀 있으니 그쪽이 진실이다.
 */
export const MERCHANT_FUNNEL_STEP = ['view_item', 'add_to_cart', 'purchase'] as const;
export type MerchantFunnelStep = (typeof MERCHANT_FUNNEL_STEP)[number];

export interface SessionEventNames {
  readonly sessionId: string;
  readonly names: readonly string[];
}

export interface FunnelStepResult {
  readonly step: FunnelStep;
  readonly label: string;
  /** 이 단계까지 도달한 세션 수 */
  readonly sessions: number;
  /** 첫 단계 대비 비율(%). 소수 첫째 자리까지 */
  readonly rateFromStart: number;
  /** 직전 단계 대비 비율(%). 첫 단계는 100 */
  readonly rateFromPrevious: number;
  /** 직전 단계에서 여기까지 못 온 세션 수 */
  readonly droppedFromPrevious: number;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * 세션별 이벤트 이름 목록에서 퍼널을 계산한다.
 *
 * **앞 단계를 모두 거친 세션만** 다음 단계로 센다(strict).
 * "그 이벤트가 있으면 도달"로 느슨하게 세면 상품 상세를 안 거치고 바로 장바구니로
 * 온 세션 때문에 뒤 단계가 앞 단계보다 커져서 전환율이 100%를 넘는 표가 나온다.
 */
/**
 * 단계별 **누적** 세션 수에서 결과를 만든다.
 *
 * 누적이란 앞 단계를 모두 밟은 세션만 다음 단계에 남는다는 뜻이다 —
 * 장바구니에 담았지만 상품을 본 기록이 없는 세션은 2단계에 세지 않는다.
 *
 * 세는 일과 비율 내는 일을 나눈 이유는 **세는 곳이 둘이기 때문**이다.
 * 작은 데이터는 메모리에서 세고(computeFunnel), 대시보드는 SQL 로 센다.
 * 비율까지 두 벌로 두면 두 화면이 다른 수를 말하게 된다.
 */
export function funnelFromCounts(
  cumulative: readonly number[],
  /** 셀 단계. 가맹점 퍼널은 주문서 진입이 빠진 셋이다 */
  steps: readonly FunnelStep[] = FUNNEL_STEP,
): FunnelStepResult[] {
  const results: FunnelStepResult[] = [];
  const startCount = cumulative[0] ?? 0;
  let previousCount = startCount;

  for (const [i, step] of steps.entries()) {
    const count = cumulative[i] ?? 0;

    results.push({
      step,
      label: FUNNEL_STEP_LABEL[step],
      sessions: count,
      rateFromStart: startCount === 0 ? 0 : round1((count / startCount) * 100),
      rateFromPrevious: previousCount === 0 ? 0 : round1((count / previousCount) * 100),
      droppedFromPrevious: previousCount - count,
    });

    previousCount = count;
  }

  return results;
}

/**
 * 세션 목록에서 퍼널을 낸다.
 *
 * 행을 전부 들고 있을 수 있을 때만 쓴다. 대시보드처럼 기간이 길어지면
 * SQL 로 세고 funnelFromCounts 에 넘긴다.
 */
export function computeFunnel(
  sessions: readonly SessionEventNames[],
  steps: readonly FunnelStep[] = FUNNEL_STEP,
): FunnelStepResult[] {
  let remaining = sessions.map((s) => new Set(s.names));

  const cumulative = steps.map((step) => {
    remaining = remaining.filter((names) => names.has(step));
    return remaining.length;
  });

  return funnelFromCounts(cumulative, steps);
}

// ── 싱크 ──────────────────────────────────────────────────────

export interface TrackedEvent {
  readonly name: EventName;
  /** 브라우저가 찍은 시각. 기기 시계는 틀릴 수 있어 순서 복원에만 쓴다. */
  readonly occurredAt: Date;
  readonly sessionId: string;
  readonly anonymousId: string;
  readonly userId: string | null;
  readonly path: string;
  readonly referrer: string | null;
  readonly productId: string | null;
  readonly variantId: string | null;
  readonly orderId: string | null;
  readonly merchantId: string | null;
  /** 금액(원). 서버가 기록하는 이벤트에서만 채워진다. */
  readonly value: number | null;
  readonly quantity: number | null;
  /** mobile | tablet | desktop. 원본 User-Agent 는 저장하지 않는다. */
  readonly deviceType: string | null;
  /** 일별 솔트로 해시한 IP. 봇 판별에만 쓴다. */
  readonly ipHash: string | null;
  readonly props: Readonly<Record<string, unknown>>;
}

export interface EventSink {
  readonly name: string;
  send(events: readonly TrackedEvent[]): Promise<void>;
}

/**
 * 여러 싱크에 동시에 보낸다.
 *
 * **일부 실패는 삼키고, 전부 실패하면 던진다.**
 *
 * 전부 삼키면 호출부가 "저장됐다"고 응답하는데 실제로는 아무 데도 안 남는 상황을
 * 알아챌 수 없다. 실제로 그런 일이 있었다 — 스키마를 바꾼 뒤 클라이언트를 다시
 * 만들지 않아 모든 적재가 실패했는데 API 는 계속 accepted 로 답했다.
 *
 * 던지더라도 사용자 요청을 깨뜨리는 건 호출부의 책임이다. 수집 API 는
 * 이 예외를 잡아 202 로 답하되 본문에는 사실대로 적는다.
 */
export class AllSinksFailedError extends Error {
  constructor(readonly failures: readonly { sink: string; error: unknown }[]) {
    super(`모든 이벤트 싱크가 실패했습니다: ${failures.map((f) => f.sink).join(', ')}`);
    this.name = 'AllSinksFailedError';
  }
}

export function fanOut(
  sinks: readonly EventSink[],
  onError?: (sinkName: string, error: unknown) => void,
): EventSink {
  return {
    name: `fanOut(${sinks.map((s) => s.name).join(', ')})`,
    async send(events) {
      if (events.length === 0 || sinks.length === 0) return;

      const results = await Promise.allSettled(sinks.map((s) => s.send(events)));
      const failures: { sink: string; error: unknown }[] = [];

      results.forEach((r, i) => {
        if (r.status !== 'rejected') return;
        const sink = sinks[i]?.name ?? 'unknown';
        failures.push({ sink, error: r.reason });
        onError?.(sink, r.reason);
      });

      if (failures.length === sinks.length) throw new AllSinksFailedError(failures);
    },
  };
}
