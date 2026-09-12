import { describe, it, expect } from 'vitest';
import { THEMES, THEME_COOKIE } from '@shop/core';
import { POST } from '~/app/api/theme/route';

/** 폼 전송 하나를 흉내 낸다 */
function submit(fields: Record<string, string>) {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.append(k, v);
  return POST(new Request('http://localhost:3000/api/theme', { method: 'POST', body }));
}

/** Location 은 **상대 경로**여야 한다 — 배포별 주소가 박히면 안 된다 */
const location = (r: Response) => r.headers.get('location');

describe('화면 밝기 고르기', () => {
  it('고른 밝기를 쿠키에 담고 보던 화면으로 돌려보낸다', async () => {
    const res = await submit({ theme: 'dark', next: '/product/wool-coat' });

    expect(res.status).toBe(303);
    expect(location(res)).toBe('/product/wool-coat');
    expect(res.headers.get('set-cookie')).toContain(`${THEME_COOKIE}=dark`);
  });

  it('밝게도 같은 길로 간다', async () => {
    expect((await submit({ theme: 'light', next: '/' })).headers.get('set-cookie')).toContain(
      `${THEME_COOKIE}=light`,
    );
  });

  it('시스템을 고르면 쿠키를 심는 게 아니라 지운다', async () => {
    /*
     * **"고른 적 없음" 과 "시스템을 고름" 을 같은 상태로 둔다.**
     * `shop.theme=system` 을 심어도 화면은 같지만, 그러면 둘이 갈려 있는데
     * 뜻은 하나인 상태가 남는다 — 나중에 기본값을 바꾸거나 쿠키를 세는 일이
     * 생기면 그때 말이 안 맞는다.
     */
    const cookie = (await submit({ theme: 'system', next: '/' })).headers.get('set-cookie');
    expect(cookie).toContain(THEME_COOKIE);
    // 지우기는 빈 값 + 만료로 나간다
    expect(cookie).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/);
  });

  it('POST 를 반복하지 않도록 303 으로 보낸다', async () => {
    // 302 는 POST 를 그대로 다시 보내는 브라우저가 있다
    for (const theme of THEMES) {
      expect((await submit({ theme, next: '/' })).status, theme).toBe(303);
    }
  });

  it('모르는 값은 심지 않는다', async () => {
    const res = await submit({ theme: 'midnight', next: '/' });
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
      expect(location(await submit({ theme: 'dark', next }))).toBe('/');
    });

    it('질의 문자열은 그대로 들고 간다 — 보던 검색 결과를 잃지 않는다', async () => {
      const res = await submit({ theme: 'dark', next: '/search?q=coat&sort=rating' });
      expect(location(res)).toBe('/search?q=coat&sort=rating');
    });
  });

  it('계정에는 저장하지 않는다', async () => {
    /*
     * 언어는 계정에 남긴다 — 메일을 보낼 때 읽어야 하는데 그때는 요청도
     * 쿠키도 없기 때문이다. 밝기는 메일에도 영수증에도 쓰이지 않고, 오히려
     * 기기마다 다른 것이 자연스럽다(낮의 데스크톱과 밤의 휴대폰).
     *
     * **DB 를 건드리기 시작하면 이 경로가 로그인 조회와 쓰기를 하게 된다** —
     * 화면 밝기를 바꾸는 데 치를 값이 아니다. 소스에서 막아 둔다.
     */
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../src/app/api/theme/route.ts', import.meta.url), 'utf8'),
    );
    expect(source).not.toContain('prisma');
    expect(source).not.toContain('getSessionUser');
  });
});
