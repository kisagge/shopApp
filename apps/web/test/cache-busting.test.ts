import { describe, it, expect, vi, beforeEach } from 'vitest';

const next = vi.hoisted(() => ({
  revalidateTag: vi.fn<(...a: any[]) => any>(),
  unstable_cache: <T>(fn: T) => fn,
}));
vi.mock('next/cache', () => next);

const cache = await import('~/lib/cache');
const { TAG } = cache;

/**
 * 태그를 터는 자리.
 *
 * `cache-coverage` 는 **어느 파일이 터는가**를 소스로 본다(쓰기 창구마다 무효화가
 * 붙어 있는지). 정작 **무엇을 터는가**는 한 줄도 안 돌고 있었다 — 엉뚱한 태그를
 * 털면 그 그물은 그대로 초록이고, 바뀐 값은 한 시간(TTL) 동안 옛것으로 보인다.
 *
 * 신선도를 지키는 것은 TTL 이 아니라 이 무효화다. TTL 은 "빠뜨린 것이 있을 때
 * 언제까지는 낫는가" 라는 안전망일 뿐이다.
 */

/** 내보낸 무효화 함수들 — 손으로 적지 않고 모듈에서 끌어낸다 */
const revalidators = Object.entries(cache).filter(
  (entry): entry is [string, () => void] =>
    entry[0].startsWith('revalidate') && typeof entry[1] === 'function',
);

const tagsOf = (fn: () => void): string[] => {
  next.revalidateTag.mockClear();
  fn();
  return next.revalidateTag.mock.calls.map(([tag]) => tag as string);
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('무효화 함수와 태그', () => {
  it('함수 목록을 손으로 적지 않는다 — 새로 만들면 아래 전수에 끌려 들어온다', () => {
    expect(revalidators.map(([name]) => name).sort()).toEqual([
      'revalidateBanners',
      'revalidateCatalog',
      'revalidateCollections',
      'revalidatePolicies',
      // 리뷰는 카탈로그와 같은 자리다 — 별점이 목록에도 나오므로 굵게 턴다
      'revalidateReviews',
      'revalidateShipping',
      'revalidateSupport',
    ]);
  });

  it.each(revalidators)('%s 는 아는 태그만 턴다', (_name, fn) => {
    const known = new Set<string>(Object.values(TAG));

    for (const tag of tagsOf(fn)) {
      expect(known, `${tag} 는 TAG 에 없는 이름이다`).toContain(tag);
    }
  });

  it('모든 태그에 터는 자리가 있다 — 아무도 안 터는 태그는 한 시간 동안 옛것이다', () => {
    const busted = new Set(revalidators.flatMap(([, fn]) => tagsOf(fn)));

    expect([...busted].sort()).toEqual([...Object.values(TAG)].sort());
  });

  it.each([
    ['revalidateCatalog', TAG.catalog],
    ['revalidateBanners', TAG.banners],
    ['revalidateCollections', TAG.collections],
    ['revalidateSupport', TAG.support],
    ['revalidatePolicies', TAG.policies],
  ])('%s 는 %s 만 턴다 — 넓게 털면 멀쩡한 캐시를 버린다', (name, tag) => {
    const fn = revalidators.find(([n]) => n === name)![1];

    expect(tagsOf(fn)).toEqual([tag]);
  });

  it('배송비는 카탈로그까지 함께 턴다 — 무료배송 문턱이 상품 화면에 적혀 있다', () => {
    /*
     * 한 줄짜리 표인데 상품·장바구니·체크아웃이 저마다 읽는다. 배송비 쪽만 털면
     * 상품 화면의 "N원 이상 무료배송" 이 옛 수로 남는다.
     */
    const fn = revalidators.find(([n]) => n === 'revalidateShipping')![1];

    expect(tagsOf(fn).sort()).toEqual([TAG.catalog, TAG.shipping].sort());
  });

  it('리뷰는 카탈로그와 같은 자리다 — 별점이 목록에도 나온다', () => {
    /*
     * 상품별로 태그를 나누지 않는다. 어차피 카탈로그를 털어야 하고, 리뷰 쓰기는
     * 드물어서 굵게 터는 비용이 태그를 하나 더 관리하는 비용보다 싸다.
     */
    expect(cache.revalidateReviews).toBe(cache.revalidateCatalog);
    expect(tagsOf(cache.revalidateReviews)).toEqual([TAG.catalog]);
  });

  it('지금 털라고 말한다 — 묵은 값을 한 번 더 내보내지 않는다', () => {
    cache.revalidateCatalog();

    expect(next.revalidateTag).toHaveBeenCalledWith(TAG.catalog, { expire: 0 });
  });
});

describe('털지 못했을 때', () => {
  it('던지지 않고 적어만 둔다 — 쓰기는 이미 끝났으니 되돌릴 수 없다', () => {
    /*
     * 무효화는 쓰기가 끝난 뒤에 부른다. 여기서 던지면 **이미 저장된 변경에
     * 500 이 나가고**, 운영자는 실패한 줄 알고 다시 누른다.
     */
    next.revalidateTag.mockImplementation(() => {
      throw new Error('요청 맥락이 없다');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => cache.revalidateCatalog()).not.toThrow();
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0]![0])).toContain('[cache]');
    warn.mockRestore();
  });

  it('한 태그가 넘어져도 나머지를 턴다', () => {
    next.revalidateTag.mockImplementationOnce(() => {
      throw new Error('첫 태그가 넘어졌다');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => cache.revalidateShipping()).not.toThrow();
    expect(next.revalidateTag).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
