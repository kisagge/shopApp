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

export function getPaymentGateway(): PaymentGateway {
  if (cached) return cached;

  const secretKey = process.env.TOSS_SECRET_KEY;

  if (mockDemanded()) {
    if (isLiveDeployment()) {
      throw new Error(
        'PAYMENT_GATEWAY=mock 은 운영 배포에서 쓸 수 없습니다. ' +
          '켜져 있으면 결제 없이 주문이 확정됩니다.',
      );
    }
    if (isUsableSecretKey(secretKey)) {
      /*
       * 진짜 키가 있는데 Mock 을 요구하는 것은 둘 중 하나다 — 실수로 켜 뒀거나,
       * 실수로 진짜 키를 넣었거나. 어느 쪽이든 조용히 넘어가면 안 된다.
       */
      throw new Error(
        '실제 결제 키가 있는데 PAYMENT_GATEWAY=mock 이 켜져 있습니다. 둘 중 하나가 잘못됐습니다.',
      );
    }
    cached = createMockGateway();
    return cached;
  }

  if (!isUsableSecretKey(secretKey)) {
    // 프로덕션에서 키를 빼먹었는데 조용히 Mock 으로 도는 게 최악이다
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'TOSS_SECRET_KEY 가 없거나 형식이 올바르지 않습니다. 프로덕션에서는 Mock 을 쓸 수 없습니다. ' +
          '검사에서 Mock 이 필요하면 PAYMENT_GATEWAY=mock 을 대놓고 켭니다.',
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

export { isUsableSecretKey, isLiveDeployment, mockDemanded };
