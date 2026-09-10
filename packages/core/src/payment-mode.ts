/**
 * 이 배포가 결제를 어떻게 치를 것인가.
 *
 * **이 파일이 생긴 이유는 판단이 두 군데서 갈렸기 때문이다.** 브라우저는
 * 클라이언트 키만 보고 "키가 없으니 Mock 으로 간다" 고 정했고, 서버는
 * 시크릿 키와 NODE_ENV 를 보고 "프로덕션에서는 Mock 을 쓸 수 없다" 며
 * 던졌다. 둘 다 각자 옳았고 서로를 몰랐다. 배포에는 두 키가 다 없었으므로
 * **주문은 만들어지고 확정만 500 이 났다** — 실제 배포에서 주문
 * 20260910-7063897 이 입금대기로 남았다. 확정 창구는 없는 주문번호에도
 * 500 을 냈다. 주문을 찾기도 전에, 게이트웨이를 만들다 터진 것이다.
 *
 * 그래서 **결론을 한 군데서 낸다.** 서버가 이 함수로 정하고, 브라우저는
 * 그 결론을 받아서 쓴다. 브라우저가 다시 키를 보고 정하는 일은 없다.
 */

/** 결제를 치르는 방식 */
export type PaymentMode =
  /** 실제 PG 결제창을 띄운다 */
  | 'window'
  /** 결제창 없이 승인을 흉내낸다 — 로컬·검사·데모 */
  | 'mock'
  /** 결제할 수 없다. 주문을 만들기 전에 막아야 한다 */
  | 'blocked';

/** 막힌 이유 — 화면 문구가 아니라 코드다 */
export type PaymentBlockReason =
  /** 운영 배포에서 Mock 을 요구했다 (데모 선언 없이) */
  | 'MOCK_IN_LIVE'
  /** 진짜 키가 있는데 Mock 을 요구했다 — 둘 중 하나가 잘못됐다 */
  | 'MOCK_WITH_REAL_KEY'
  /** 시크릿 키는 있는데 클라이언트 키가 없다 — 결제창을 띄울 수 없다 */
  | 'NO_CLIENT_KEY'
  /** 프로덕션인데 시크릿 키가 없다 */
  | 'NO_SECRET_KEY';

export interface PaymentModeInput {
  /** 형식까지 확인한 TOSS_SECRET_KEY 가 쓸 만한가 */
  hasSecretKey: boolean;
  /** 형식까지 확인한 NEXT_PUBLIC_TOSS_CLIENT_KEY 가 쓸 만한가 */
  hasClientKey: boolean;
  /** 진짜 운영 배포인가 (Vercel 은 VERCEL_ENV=production 을 준다) */
  liveDeployment: boolean;
  /** PAYMENT_GATEWAY=mock — 대놓고 Mock 을 요구했는가 */
  mockDemanded: boolean;
  /**
   * DEMO_PAYMENT=1 — **이 배포는 돈이 오가지 않는 데모라고 선언**한 것.
   *
   * 이 저장소는 포트폴리오라 사업자번호가 없고, 그러니 실제 PG 계약도 없다.
   * 그렇다고 배포에서 결제를 못 하게 두면 주문 흐름을 아무도 끝까지 볼 수
   * 없다. 그래서 데모라고 대놓고 선언하면 운영 배포에서도 Mock 을 쓴다.
   *
   * **스위치를 둘로 나눈 이유**는 실수로 켜지는 것을 막기 위해서다.
   * PAYMENT_GATEWAY=mock 하나만으로는 운영에서 절대 안 켜진다. 돈이 걸린
   * 자리에서 "조용히 Mock 으로 도는" 경우는 없어야 한다.
   */
  demoPayment: boolean;
  /** NODE_ENV=production — 빌드가 프로덕션인가 (운영 배포와는 다르다) */
  production: boolean;
}

/**
 * 갈래로 나눠 둔다 — `blocked` 일 때만 이유가 있고, 그때는 **반드시** 있다.
 * 하나의 모양에 `reason?` 로 두면 부르는 쪽이 매번 없는 경우를 달래야 한다.
 */
export type PaymentModeResult =
  | { mode: 'window' | 'mock' }
  | { mode: 'blocked'; reason: PaymentBlockReason };

/**
 * 순서가 곧 규칙이다 — 위에서부터 먼저 걸리는 것이 이긴다.
 *
 * 대놓고 요구한 것(Mock)을 먼저 보고, 그다음 키를 본다. 요구가 잘못됐으면
 * 키가 무엇이든 막는다 — 요구와 키가 어긋난 채로 도는 것이 가장 나쁘다.
 */
export function paymentMode(input: PaymentModeInput): PaymentModeResult {
  if (input.mockDemanded) {
    if (input.hasSecretKey) return { mode: 'blocked', reason: 'MOCK_WITH_REAL_KEY' };
    if (input.liveDeployment && !input.demoPayment) {
      return { mode: 'blocked', reason: 'MOCK_IN_LIVE' };
    }
    return { mode: 'mock' };
  }

  if (input.hasSecretKey) {
    // 시크릿만으로는 결제창을 못 띄운다. 창을 못 띄우면 주문만 만들고 멈춘다
    return input.hasClientKey ? { mode: 'window' } : { mode: 'blocked', reason: 'NO_CLIENT_KEY' };
  }

  // 프로덕션에서 키를 빼먹었는데 조용히 Mock 으로 도는 게 최악이다
  if (input.production) return { mode: 'blocked', reason: 'NO_SECRET_KEY' };
  return { mode: 'mock' };
}

/** 운영자가 읽을 문구 — 로그와 서버 오류에 쓴다 */
export const PAYMENT_BLOCK_MESSAGE: Readonly<Record<PaymentBlockReason, string>> = {
  MOCK_IN_LIVE:
    'PAYMENT_GATEWAY=mock 은 운영 배포에서 쓸 수 없습니다. ' +
    '돈이 오가지 않는 데모라면 DEMO_PAYMENT=1 을 함께 켭니다.',
  MOCK_WITH_REAL_KEY:
    '실제 결제 키가 있는데 PAYMENT_GATEWAY=mock 이 켜져 있습니다. 둘 중 하나가 잘못됐습니다.',
  NO_CLIENT_KEY:
    'TOSS_SECRET_KEY 는 있는데 NEXT_PUBLIC_TOSS_CLIENT_KEY 가 없거나 형식이 올바르지 않습니다. ' +
    '결제창을 띄울 수 없습니다.',
  NO_SECRET_KEY:
    'TOSS_SECRET_KEY 가 없거나 형식이 올바르지 않습니다. 프로덕션에서는 Mock 을 쓸 수 없습니다. ' +
    '검사나 데모에서 Mock 이 필요하면 PAYMENT_GATEWAY=mock 을 대놓고 켭니다.',
};
