import 'server-only';
import { unstable_cache, revalidateTag } from 'next/cache';

/**
 * 공개 화면의 DB 읽기 캐시.
 *
 * **페이지는 그대로 동적으로 둔다.** ISR(revalidate)로 바꾸면 빌드가 DB 에
 * 닿아야 하는데, 지금 빌드는 DB 를 전혀 건드리지 않는다 — 그 의존을 새로
 * 만들면 Neon 이 잠깐 막혔을 때 배포가 통째로 실패한다. 문제로 적혀 있던
 * 것은 "매 요청 DB 를 친다" 이고, 그건 읽기를 캐싱하면 사라진다.
 *
 * 캐시에는 **아무나 봐도 되는 것만** 넣는다. 사용자마다 다른 값(찜 여부,
 * 내 리뷰인지, 알림 신청 여부)은 절대 들어가면 안 된다 — 한 사람의 화면이
 * 다음 사람에게 그대로 나간다.
 */

export const TAG = {
  /** 상품 목록·상세·카테고리. 상품이 바뀌면 통째로 턴다. */
  catalog: 'catalog',
  /** 홈 배너 */
  banners: 'banners',
  /** 공지·FAQ */
  support: 'support',
} as const;

/**
 * 얼마나 묵어도 되는가.
 *
 * 재고와 품절 표시가 최대 이만큼 늦는다. **팔리지 않을 것을 팔리는 것처럼
 * 보여 줄 수 있다는 뜻이지만**, 주문을 만들 때 서버가 재고를 다시 보므로
 * 초과 판매로 이어지지는 않는다. 목록에서 잠깐 늦게 품절로 바뀔 뿐이다.
 */
export const TTL = {
  catalog: 60,
  banners: 60,
  /**
   * 공지와 FAQ 는 하루에 몇 번 바뀌는 글이 아니다. 짧게 잡을 이유가 없고,
   * 고친 순간에는 태그를 털어 곧바로 반영한다.
   */
  support: 300,
} as const;

interface CacheOptions {
  readonly key: readonly string[];
  readonly tags: readonly string[];
  readonly revalidate: number;
}

/** unstable_cache 를 한 겹 감싼다. 태그와 수명을 한곳에서 정하기 위해서다. */
export function cachedRead<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  options: CacheOptions,
): (...args: A) => Promise<R> {
  return unstable_cache(fn, [...options.key], {
    tags: [...options.tags],
    revalidate: options.revalidate,
  });
}

/**
 * 캐시를 턴다.
 *
 * 요청 바깥(스크립트·시드)에서 부르면 Next 가 예외를 던진다. 쓰기는 이미
 * 끝난 뒤라 여기서 실패해도 되돌릴 것이 없고, 캐시는 수명이 지나면 어차피
 * 사라진다. 그래서 삼킨다 — 대신 조용히 넘어가지는 않는다.
 */
function bust(tag: string): void {
  try {
    /*
     * 두 번째 인자로 **지금 곧 만료**시킨다(Next 16).
     *
     * 이름이 있는 프로필('max' 같은)을 주면 그 프로필의 수명만큼 남겨 둔다.
     * 실제로 'max' 로 넣어 보니 값이 바뀌었는데도 홈이 60초 동안 옛 이름을
     * 계속 보여 줬다. 우리가 이 함수를 부르는 시점은 값이 이미 바뀐 뒤라
     * 남겨 둘 이유가 없다.
     *
     * updateTag 가 "즉시" 를 위한 함수지만 서버 액션에서만 쓸 수 있고,
     * 우리 쓰기는 전부 라우트 핸들러다.
     */
    revalidateTag(tag, { expire: 0 });
  } catch (error) {
    console.warn('[cache] 태그를 털지 못했습니다', tag, error);
  }
}

/** 상품이 바뀌었다 — 목록·상세·카테고리 전부 */
export const revalidateCatalog = (): void => bust(TAG.catalog);

/** 공지나 FAQ 가 바뀌었다 */
export const revalidateSupport = (): void => bust(TAG.support);

/** 배너가 바뀌었다 */
export const revalidateBanners = (): void => bust(TAG.banners);

/**
 * 리뷰가 바뀌었다.
 *
 * 상품별로 태그를 나누지 않는다. 별점은 목록에도 나오므로 어차피 카탈로그를
 * 털어야 하고, 리뷰 쓰기는 드물어서 굵게 터는 비용이 태그를 하나 더 관리하는
 * 비용보다 싸다.
 */
export const revalidateReviews = revalidateCatalog;
