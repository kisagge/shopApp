import { describe, it, expect, vi, beforeEach } from 'vitest';
import { THEME_COOKIE } from '@shop/core';
import { LOCALE_COOKIE } from '@shop/i18n';
import { CLIENT_MESSAGE_GROUPS } from '~/lib/i18n/client-groups.generated';

/**
 * 요청 하나의 바탕 둘 — **밝기와 언어.**
 *
 * 둘 다 쿠키·헤더를 읽어 `<html>` 에 박는 자리인데, 창구(쿠키를 심는 쪽)에만
 * 검사가 있고 **읽는 쪽이 비어 있었다.**
 *
 * 세 가지가 걸려 있다.
 *
 * **첫 그림의 색.** 서버가 정해 내려보내므로 첫 HTML 부터 맞는 색·말이 나간다.
 * 여기서 틀리면 어두운 방에서 쓰는 사람에게 흰 화면이 한 번씩 번쩍인다.
 *
 * **요청 맥락이 없을 때 터지지 않는 것.** 배치나 검사가 라우트 안의 함수를
 * 직접 부르면 `cookies()` 는 던진다 — 그때 통째로 터지면 검증 오류 하나가
 * 500 이 된다.
 *
 * **그러면서도 Next 가 흐름을 제어하려고 던진 것은 넘기는 것.** 삼키면 그
 * 화면이 정적으로 잡혀 **모두에게 같은 언어가 나간다.** 실제로 처음 그렇게
 * 적었다가 빌드가 /404 에서 깨졌고, 안 깨졌으면 조용히 잘못된 화면이
 * 배포됐을 것이다.
 */

const CONTROL = Symbol('next-control-flow');
vi.mock('next/navigation', () => ({
  unstable_rethrow: (error: unknown) => {
    if (error instanceof Error && CONTROL in error) throw error;
  },
}));

const nextHeaders = vi.hoisted(() => ({
  cookies: vi.fn<(...a: any[]) => any>(),
  headers: vi.fn<(...a: any[]) => any>(),
}));
vi.mock('next/headers', () => nextHeaders);

const { getTheme } = await import('~/lib/theme');
const { getLocale, getT, getDictionary } = await import('~/lib/i18n/server');

/** 쿠키 창구 흉내 — 넘긴 값만 들고 있다 */
const cookieJar = (store: Record<string, string>) => ({
  get: (name: string) => (name in store ? { name, value: store[name] } : undefined),
});

const control = () => Object.assign(new Error('NEXT_REDIRECT'), { [CONTROL]: true });

const request = (over: { cookies?: Record<string, string>; acceptLanguage?: string } = {}) => {
  nextHeaders.cookies.mockResolvedValue(cookieJar(over.cookies ?? {}));
  nextHeaders.headers.mockResolvedValue(
    new Headers(over.acceptLanguage ? { 'accept-language': over.acceptLanguage } : {}),
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  request();
});

describe('이번 요청의 밝기', () => {
  it.each(['dark', 'light', 'system'])('%s 를 고른 쿠키를 그대로 읽는다', async (theme) => {
    request({ cookies: { [THEME_COOKIE]: theme } });

    expect(await getTheme()).toBe(theme);
  });

  it('쿠키가 없으면 system 이다 — 기기 설정을 따른다', async () => {
    expect(await getTheme()).toBe('system');
  });

  it('모르는 값은 system 으로 본다 — 손으로 고친 쿠키가 화면을 깨뜨리지 않게', async () => {
    request({ cookies: { [THEME_COOKIE]: 'neon' } });

    expect(await getTheme()).toBe('system');
  });

  it('그 쿠키만 읽는다 — 다른 쿠키로는 색이 안 바뀐다', async () => {
    request({ cookies: { [LOCALE_COOKIE]: 'dark' } });

    expect(await getTheme()).toBe('system');
  });

  it('요청 맥락이 없으면 system 으로 물러난다 — 배치가 터지지 않게', async () => {
    nextHeaders.cookies.mockRejectedValue(new Error('called outside a request'));

    expect(await getTheme()).toBe('system');
  });

  it('Next 가 흐름을 제어하려고 던진 것은 그대로 넘긴다', async () => {
    /*
     * 삼키면 그 화면이 정적으로 잡혀 **모두에게 같은 색이 나간다.** 빌드가
     * 깨져 주는 것이 조용히 잘못 배포되는 것보다 낫다.
     */
    nextHeaders.cookies.mockRejectedValue(control());

    await expect(getTheme()).rejects.toThrow('NEXT_REDIRECT');
  });
});

describe('이번 요청의 언어', () => {
  it('고른 쿠키가 있으면 그 말이다', async () => {
    request({ cookies: { [LOCALE_COOKIE]: 'ja' }, acceptLanguage: 'en-US,en;q=0.9' });

    expect(await getLocale()).toBe('ja');
  });

  it('쿠키가 없으면 브라우저가 말한 것을 따른다', async () => {
    request({ acceptLanguage: 'en-US,en;q=0.9' });

    expect(await getLocale()).toBe('en');
  });

  it('둘 다 없으면 기본 언어다', async () => {
    expect(await getLocale()).toBe('ko');
  });

  it('모르는 말을 적어 보내도 기본 언어로 간다', async () => {
    request({ acceptLanguage: 'xx-ZZ' });

    expect(await getLocale()).toBe('ko');
  });

  it('처음 온 사람에게 쿠키를 심지 않는다 — 읽기만 한다', async () => {
    /*
     * 심어 두면 나중에 브라우저 언어를 바꿔도 화면이 따라오지 않는다. 쿠키는
     * 사용자가 직접 고를 때만 생기고, 그때부터 추측을 그만둔다.
     */
    const jar = cookieJar({});
    const set = vi.fn();
    nextHeaders.cookies.mockResolvedValue({ ...jar, set, delete: vi.fn() });

    await getLocale();

    expect(set).not.toHaveBeenCalled();
  });

  it('요청 맥락이 없으면 기본 언어로 물러난다', async () => {
    nextHeaders.cookies.mockRejectedValue(new Error('called outside a request'));

    expect(await getLocale()).toBe('ko');
  });

  it('Next 가 흐름을 제어하려고 던진 것은 그대로 넘긴다', async () => {
    nextHeaders.cookies.mockRejectedValue(control());

    await expect(getLocale()).rejects.toThrow('NEXT_REDIRECT');
  });

  it('고른 말의 사전으로 문구를 찾는다', async () => {
    request({ cookies: { [LOCALE_COOKIE]: 'en' } });

    const t = await getT();

    expect(t('nav.cart')).toBe('Cart');
  });
});

describe('브라우저로 내려보내는 사전', () => {
  /*
   * **화면으로 사전을 내려보내는 유일한 문이다.** 브라우저 코드가 사전을 직접
   * import 하면 번들러가 세 언어를 다 넣는다 — 고르는 일은 실행 시각인데
   * import 는 빌드 시각이기 때문이다. 실제로 한국어 화면 하나가 영어·일본어까지
   * 받고 있었다.
   *
   * 그 위에 **서버만 쓰는 말은 떼어 낸다.** 메일 본문·배치 알림 같은 것이
   * 2.2KB 였고, 앱은 켤 때마다 문서를 통째로 받으므로 그 값을 매번 치른다.
   */
  const keysOf = async () => Object.keys(await getDictionary());
  const groupOf = (key: string) => key.slice(0, key.indexOf('.'));

  it('고른 한 벌만 내려간다', async () => {
    request({ cookies: { [LOCALE_COOKIE]: 'ja' } });
    const dict = await getDictionary();

    expect(Object.values(dict).length).toBeGreaterThan(0);
    expect(dict['nav.cart']).not.toBe('장바구니');
  });

  it('브라우저가 쓰는 갈래만 남는다', async () => {
    const groups = new Set((await keysOf()).map(groupOf));

    expect(groups.size).toBeGreaterThan(0);
    for (const group of groups) {
      expect(CLIENT_MESSAGE_GROUPS, `${group} 는 화면이 쓰지 않는 갈래다`).toContain(group);
    }
  });

  it('서버만 쓰는 갈래는 떼어 낸다 — 앱이 켤 때마다 그 값을 치른다', async () => {
    const full = (await import('@shop/i18n/all')).DICTIONARIES['ko'];
    const serverOnly = Object.keys(full).filter((k) => !CLIENT_MESSAGE_GROUPS.includes(groupOf(k)));
    const sent = new Set(await keysOf());

    expect(serverOnly.length, '서버 전용 문구가 하나도 없으면 이 검사가 헛돈다').toBeGreaterThan(0);
    expect(serverOnly.filter((k) => sent.has(k))).toEqual([]);
  });

  it('남기는 갈래는 통째로 남긴다 — 열쇠를 조립하는 화면이 터지지 않게', async () => {
    /*
     * 화면 코드는 열쇠를 이름으로 조립하는 자리가 있다(`keysOf`·`t.category`·
     * 계약의 `valid.*`). 열쇠 하나하나로 자르면 조립한 열쇠가 사전에 없어
     * 화면이 터진다 — 갈래째 남기면 그 위험이 사라진다.
     */
    const full = (await import('@shop/i18n/all')).DICTIONARIES['ko'];
    const sent = new Set(await keysOf());
    const missing = Object.keys(full).filter(
      (k) => CLIENT_MESSAGE_GROUPS.includes(groupOf(k)) && !sent.has(k),
    );

    expect(missing, '이 열쇠들은 갈래는 내려가는데 빠졌다').toEqual([]);
  });
});
