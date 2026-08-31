import 'server-only';
import type { PaymentGateway } from '@shop/core';
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

export function getPaymentGateway(): PaymentGateway {
  if (cached) return cached;

  const secretKey = process.env.TOSS_SECRET_KEY;

  if (!isUsableSecretKey(secretKey)) {
    // 프로덕션에서 키를 빼먹었는데 조용히 Mock 으로 도는 게 최악이다
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'TOSS_SECRET_KEY 가 없거나 형식이 올바르지 않습니다. 프로덕션에서는 Mock 을 쓸 수 없습니다.',
      );
    }
    if (secretKey) {
      console.warn(
        '[payment] TOSS_SECRET_KEY 형식이 올바르지 않아 Mock 게이트웨이를 씁니다. ' +
          '실제 연동을 하려면 https://developers.tosspayments.com 에서 테스트 키를 발급받으세요.',
      );
    }
    cached = createMockGateway();
    return cached;
  }

  cached = createTossGateway(secretKey);
  return cached;
}

/** 테스트에서 교체한다 */
export function setPaymentGateway(gateway: PaymentGateway | null): void {
  cached = gateway;
}

export { isUsableSecretKey };
