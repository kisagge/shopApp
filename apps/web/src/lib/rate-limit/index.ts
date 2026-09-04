import 'server-only';
import { NextResponse } from 'next/server';
import {
  consume, isExpired, RATE_LIMIT,
  type RateLimitPolicy, type RateLimitState, type RateLimitSurface,
} from '@shop/core';
import { hashIp } from '~/lib/analytics/server';

/**
 * 공개 API 요청 제한.
 *
 * 인증 경로는 Better Auth 가 스스로 막는다. 여기서 다루는 것은 그 밖의
 * **로그인 없이도 두드릴 수 있는 쓰기 창구**다.
 *
 * **한계를 먼저 적는다.** 기본 구현은 프로세스 메모리를 쓴다. 서버리스에서는
 * 인스턴스가 여럿이고 식으면 사라지므로, 이것은 **벽이 아니라 과속방지턱**이다.
 * 한 대를 붙잡고 계속 두드리는 것은 막지만, 여러 인스턴스로 흩어지는 요청은
 * 그만큼 새어 나간다.
 *
 * 그래도 두는 이유는 셋이다.
 * 1. `while true; do curl; done` 같은 가장 흔한 경우가 실제로 막힌다
 * 2. 제한이 붙을 자리와 응답 형식이 코드에 자리 잡는다
 * 3. 나중에 공유 저장소를 끼울 때 **구현 하나만 바꾸면 된다** —
 *    결제 게이트웨이·이벤트 싱크·메일과 같은 구조다
 */

export interface RateLimiter {
  readonly name: string;
  take(key: string, policy: RateLimitPolicy): Promise<{
    allowed: boolean;
    remaining: number;
    retryAfterSeconds: number;
  }>;
}

/**
 * 프로세스 메모리에 센다.
 *
 * 표가 무한히 자라지 않도록 쓸 때마다 조금씩 걷어낸다. 별도 타이머를 두면
 * 서버리스에서 인스턴스가 잠들 때 함께 죽어서 의미가 없다.
 */
export function memoryRateLimiter(): RateLimiter {
  const table = new Map<string, RateLimitState>();

  return {
    name: 'memory',
    take(key, policy) {
      const now = Date.now();

      // 표가 커졌을 때만 훑는다. 요청마다 전체를 도는 것은 비싸다.
      if (table.size > 5_000) {
        for (const [k, v] of table) {
          if (isExpired(v, now, policy)) table.delete(k);
        }
      }

      const result = consume(table.get(key), now, policy);
      table.set(key, result.next);

      return Promise.resolve({
        allowed: result.allowed,
        remaining: result.remaining,
        retryAfterSeconds: result.retryAfterSeconds,
      });
    },
  };
}

let limiter: RateLimiter | null = null;

export function getRateLimiter(): RateLimiter {
  limiter ??= memoryRateLimiter();
  return limiter;
}

/** 테스트에서 갈아 끼운다. null 을 주면 새 것을 만든다. */
export function setRateLimiterForTest(next: RateLimiter | null): void {
  limiter = next;
}

/**
 * 누구의 요청인가.
 *
 * 로그인했으면 사용자 id 를 쓴다. **같은 사무실에서 여러 사람이 쓰면 IP 가
 * 같아서**, IP 로만 세면 한 사람이 남의 몫까지 써 버린다.
 *
 * 비로그인은 IP 를 해시해서 쓴다 — 원본을 들고 있을 이유가 없고, 이미
 * 분석 쪽에서 쓰는 함수를 그대로 가져다 쓴다(날짜가 섞여 장기 추적이 안 된다).
 */
export function requesterKey(
  surface: RateLimitSurface,
  request: Request,
  userId: string | null,
): string {
  if (userId) return `${surface}:u:${userId}`;

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  // IP 도 없으면 한 덩어리로 묶는다. 셀 수 없는 요청을 무제한으로 두지 않는다.
  return `${surface}:ip:${hashIp(ip) ?? 'unknown'}`;
}

/**
 * 제한에 걸리면 429 를, 아니면 null 을 준다.
 *
 * 부르는 쪽은 `if (limited) return limited;` 한 줄이면 된다. 응답을 여기서
 * 만드는 이유는 형식이 창구마다 달라지면 화면이 그걸 다 알아야 하기 때문이다.
 */
export async function enforceRateLimit(
  surface: RateLimitSurface,
  request: Request,
  userId: string | null,
): Promise<NextResponse | null> {
  const policy = RATE_LIMIT[surface];
  const result = await getRateLimiter().take(requesterKey(surface, request, userId), policy);

  if (result.allowed) return null;

  return NextResponse.json(
    { code: 'RATE_LIMITED', message: '요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.' },
    {
      status: 429,
      headers: {
        // 표준 헤더다. 클라이언트가 언제 다시 시도할지 스스로 정할 수 있다.
        'retry-after': String(result.retryAfterSeconds),
      },
    },
  );
}
