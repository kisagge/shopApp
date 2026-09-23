import { vi, type Mock } from 'vitest';

/**
 * 캐시 모듈(~/lib/cache)을 통째로 흉내 낸다.
 *
 * **필요한 창구 하나만 적어 두면 갈라진다.** `() => ({ revalidateCatalog })` 는 모듈을
 * 그 하나로 바꾼다 — 검사 대상이 닿는 어느 파일이든 `cachedRead` 를 쓰기 시작하면
 * 그 검사는 "No cachedRead export is defined" 로 진다. 배송 정책에 캐시를 씌우자마자
 * 실제로 그렇게 졌고, 원인은 그 검사와 아무 상관 없는 다른 파일이었다.
 *
 * **캐시는 통과시킨다.** 검사에서 보려는 것은 조회가 무엇을 돌려주는가이지 감싸개가
 * 아니다 — `cachedRead` 는 받은 함수를 그대로 돌려준다.
 *
 * 무효화는 `vi.fn()` 이라 "털었는가" 를 검사가 확인할 수 있다.
 */
/** 흉내 낸 캐시 모듈. 무효화는 손잡이라 검사가 "털었는가" 를 물을 수 있다. */
export interface CacheMock {
  readonly cachedRead: <A extends unknown[], R>(fn: (...args: A) => Promise<R>) => (...args: A) => Promise<R>;
  readonly TAG: Readonly<Record<string, string>>;
  readonly TTL: Readonly<Record<string, number>>;
  readonly revalidateCatalog: Mock;
  readonly revalidateSupport: Mock;
  readonly revalidatePolicies: Mock;
  readonly revalidateShipping: Mock;
  readonly revalidateBanners: Mock;
  readonly revalidateCollections: Mock;
  readonly revalidateReviews: Mock;
}

export function cacheMock(): CacheMock {
  return {
    cachedRead: <A extends unknown[], R>(fn: (...args: A) => Promise<R>) => fn,
    TAG: {
      catalog: 'catalog',
      banners: 'banners',
      collections: 'collections',
      support: 'support',
      policies: 'policies',
      shipping: 'shipping',
    },
    TTL: { catalog: 60, banners: 60, collections: 60, support: 60, shipping: 60 },
    revalidateCatalog: vi.fn(),
    revalidateSupport: vi.fn(),
    revalidatePolicies: vi.fn(),
    revalidateShipping: vi.fn(),
    revalidateBanners: vi.fn(),
    revalidateCollections: vi.fn(),
    revalidateReviews: vi.fn(),
  };
}
