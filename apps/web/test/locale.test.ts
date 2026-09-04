import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LOCALE_COOKIE, LOCALES } from '@shop/i18n';
import { POST } from '~/app/api/locale/route';

/** 폼 전송 하나를 흉내 낸다 */
function submit(fields: Record<string, string>) {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.append(k, v);
  return POST(new Request('http://localhost:3000/api/locale', { method: 'POST', body }));
}

/**
 * Location 은 **상대 경로**여야 한다 — 배포별 주소가 박히면 안 된다.
 * 그래서 절대 주소로 파싱하지 않고 그대로 읽는다.
 */
const location = (r: Response) => r.headers.get('location');

describe('언어 고르기', () => {
  it('고른 말을 쿠키에 담고 보던 화면으로 돌려보낸다', async () => {
    const res = await submit({ locale: 'ja', next: '/product/wool-coat' });

    expect(res.status).toBe(303);
    expect(location(res)).toBe('/product/wool-coat');
    expect(res.headers.get('set-cookie')).toContain(`${LOCALE_COOKIE}=ja`);
  });

  it('세 언어를 모두 받는다', async () => {
    for (const locale of LOCALES) {
      const res = await submit({ locale, next: '/' });
      expect(res.headers.get('set-cookie'), locale).toContain(`${LOCALE_COOKIE}=${locale}`);
    }
  });

  it('POST 를 반복하지 않도록 303 으로 보낸다', async () => {
    // 302 는 POST 를 그대로 다시 보내는 브라우저가 있다
    expect((await submit({ locale: 'en', next: '/' })).status).toBe(303);
  });

  it('모르는 말은 심지 않는다', async () => {
    const res = await submit({ locale: 'zh', next: '/' });
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(location(res)).toBe('/');
  });

  describe('돌아갈 곳은 우리 경로만', () => {
    // 폼이 보낸 값이라 아무거나 들어올 수 있다. 그대로 리다이렉트하면
    // 우리 도메인이 남의 사이트로 보내 주는 발판이 된다.
    it.each([
      ['다른 사이트', 'https://evil.example/steal'],
      ['프로토콜 생략', '//evil.example/steal'],
      ['경로가 아닌 값', 'evil.example'],
      ['빈 값', ''],
    ])('%s 는 홈으로 보낸다', async (_label, next) => {
      expect(location(await submit({ locale: 'en', next }))).toBe('/');
    });

    it('질의 문자열은 그대로 들고 간다 — 보던 검색 결과를 잃지 않는다', async () => {
      const res = await submit({ locale: 'en', next: '/search?q=coat&sort=rating' });
      expect(location(res)).toBe('/search?q=coat&sort=rating');
    });

    it('배포별 주소를 Location 에 박지 않는다', async () => {
      // 절대 주소로 만들면 사용자가 보던 주소에서 벗어난다
      expect(location(await submit({ locale: 'en', next: '/cart' }))).toBe('/cart');
    });
  });
});

describe('언어를 붙인 자리', () => {
  const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');

  it('루트 레이아웃이 html lang 을 요청 언어로 정한다', () => {
    // 여기가 고정값으로 돌아가면 낭독기가 일본어를 한국어 발음으로 읽는다
    const source = read('src/app/layout.tsx');
    expect(source).not.toMatch(/<html lang="ko"/);
    expect(source).toContain('lang={LOCALE_TAG[locale]}');
  });

  it('core 의 카탈로그 규칙에는 화면 문구가 없다', () => {
    /*
     * 정책은 언어를 몰라야 한다. 예전에는 여기서 정렬 이름표와 빈 결과
     * 안내 문장을 한국어로 만들었는데, 그러면 화면이 세 나라 말로 나갈 때
     * 이 파일만 한국어에 묶인다. 한국어 문장을 되돌려 놓으면 여기서 걸린다.
     *
     * 주석은 한국어로 적으므로 검사 전에 걷어낸다.
     */
    const source = read('../../packages/core/src/catalog.ts')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    const strings = [...source.matchAll(/(['"`])((?:(?!\1)[^\\])*)\1/g)].map((m) => m[2]!);
    expect(strings.filter((s) => /[가-힣]/.test(s))).toEqual([]);
  });

  it('계약이 다시 문구표를 들지 않는다', () => {
    /*
     * 계약에는 아직 Zod 검증 문구가 한국어로 남아 있다 — 그쪽은 다음 몫이다.
     * 다만 **화면에 그대로 찍히는 문구표**(LINE_ISSUE_MESSAGE)는 옮겼고,
     * 그것이 돌아오면 장바구니·결제 화면이 다시 한국어로 굳는다.
     */
    expect(read('../../packages/contract/src/cart.ts')).not.toContain('LINE_ISSUE_MESSAGE');
  });
});
