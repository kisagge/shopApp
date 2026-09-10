import 'server-only';
import type { PaymentGateway, PaymentModeResult } from '@shop/core';
import { paymentMode, PAYMENT_BLOCK_MESSAGE } from '@shop/core';
import { isUsableClientKey } from './client';
import { createTossGateway } from './toss';
import { createMockGateway } from './mock';

let cached: PaymentGateway | null = null;

/**
 * 토스 시크릿 키인지 형식으로 확인한다.
 *
 * "있으면 실제 PG" 로만 판단하면 .env.example 을 복사해 만든 플레이스홀더
 * (`test_sk_여기에`)가 진짜 키로 취급된다. 그러면 Mock 으로 도는 줄 알고
 * 개발하다 실제 API 를 두드리고 UNAUTHORIZED_KEY 를 받는다 — 실제로 겪었다.
 */
function isUsableSecretKey(key: string | undefined): key is string {
  if (!key) return false;
  return /^(test|live)_(sk|gsk)_[A-Za-z0-9]{20,}$/.test(key.trim());
}

/**
 * **프로덕션 빌드와 운영 배포는 다르다.**
 *
 * 이 둘을 NODE_ENV 하나로 보고 있었다. 그런데 E2E 는 `next start` 로 도는
 * 프로덕션 빌드다 — 진짜 운영이 아닌데도 키를 요구받아 결제 승인 뒤가
 * **검사를 한 번도 지나가지 못했다.** 승인 · 결제완료 · 재고 확정 · 안내가
 * 전부 고정된 값으로 도는 단위 검사에만 덮여 있었고, 그건 조회 필드를
 * 잘못 적어도 통과한다 — 주문 메일에서 실제로 겪었다.
 *
 * 그래서 가르는 기준을 배포로 옮긴다. Vercel 은 실제 운영에만
 * VERCEL_ENV=production 을 준다.
 */
function isLiveDeployment(): boolean {
  return process.env.VERCEL_ENV === 'production';
}

/**
 * 검사용 Mock 을 대놓고 요구했는가.
 *
 * 로그인 요청 제한을 E2E 에서만 끄는 것(AUTH_RATE_LIMIT)과 같은 모양이다.
 * 다만 여기는 돈이 걸려 있어 두 겹을 더 뒀다 — 운영 배포에서 켜면 던지고,
 * 진짜 키가 있는데 켜도 던진다. **조용히 Mock 으로 도는 경우가 없어야 한다.**
 */
function mockDemanded(): boolean {
  return process.env.PAYMENT_GATEWAY === 'mock';
}

/**
 * 이 배포가 결제를 어떻게 치르는가 — **결론을 내는 유일한 자리**.
 *
 * 판단 자체는 `@shop/core` 의 `paymentMode` 가 한다. 여기는 환경변수를
 * 읽어서 넘기기만 한다 — 정책은 core, 실행은 앱.
 *
 * 브라우저도 이 결론을 쓴다. 결제 화면이 서버에서 이것을 계산해 폼에
 * 내려 준다(`apps/web/src/app/checkout/page.tsx`). 브라우저가 키를 다시
 * 보고 스스로 정하는 일은 없다 — 그렇게 갈렸다가 배포에서 확정이 터졌다.
 */
export function serverPaymentMode(): PaymentModeResult {
  return paymentMode({
    hasSecretKey: isUsableSecretKey(process.env.TOSS_SECRET_KEY),
    hasClientKey: isUsableClientKey(process.env['NEXT_PUBLIC_TOSS_CLIENT_KEY']),
    liveDeployment: isLiveDeployment(),
    mockDemanded: mockDemanded(),
    demoPayment: process.env.DEMO_PAYMENT === '1',
    production: process.env.NODE_ENV === 'production',
  });
}

export function getPaymentGateway(): PaymentGateway {
  if (cached) return cached;

  const decided = serverPaymentMode();
  /*
   * 여기까지 왔는데 막혀 있으면 설정이 잘못된 것이다. 결제 화면이 미리
   * 막으므로 사람이 이 길로 오지는 않는다 — 그래도 던진다. 조용히 Mock 으로
   * 도는 것보다 500 이 낫고, 무엇보다 이유가 로그에 남는다.
   */
  if (decided.mode === 'blocked') throw new Error(PAYMENT_BLOCK_MESSAGE[decided.reason]);

  const secretKey = process.env.TOSS_SECRET_KEY;
  if (decided.mode === 'mock') {
    if (secretKey) {
      console.warn(
        '[payment] TOSS_SECRET_KEY 형식이 올바르지 않아 Mock 게이트웨이를 씁니다. ' +
          '실제 연동을 하려면 https://developers.tosspayments.com 에서 테스트 키를 발급받으세요.',
      );
    }
    cached = createMockGateway();
    return cached;
  }

  // mode 가 window 라는 것은 이 키가 형식까지 통과했다는 뜻이다
  if (!secretKey) throw new Error(PAYMENT_BLOCK_MESSAGE.NO_SECRET_KEY);
  cached = createTossGateway(secretKey);
  return cached;
}

/** 테스트에서 교체한다 */
export function setPaymentGateway(gateway: PaymentGateway | null): void {
  cached = gateway;
}

export { isUsableSecretKey, isLiveDeployment, mockDemanded };
