import { NextResponse } from 'next/server';
import { isTheme, THEME_COOKIE } from '@shop/core';

/**
 * 화면 밝기를 고른다.
 *
 * **평범한 폼 전송이다.** 언어 고르기(`/api/locale`)와 같은 결로 만든다 —
 * 스크립트가 막힌 환경에서 밝기만 못 바꾸는 것은 이상하고, 무엇보다 이 값은
 * 서버가 첫 HTML 에 박아야 하는 값이라 어차피 서버를 거친다.
 *
 * **계정에는 저장하지 않는다.** 그 이유는 `@shop/core` 의 theme.ts 에 적었다.
 */

const YEAR = 60 * 60 * 24 * 365;

/**
 * 돌아갈 곳.
 *
 * 폼이 보낸 값이므로 **누가 무엇이든 넣을 수 있다.** 다른 사이트 주소가
 * 들어오면 우리 도메인이 그리로 튕겨 주는 발판이 된다. 우리 경로 하나만
 * 받는다 — `//evil.com` 은 브라우저가 다른 호스트로 읽으므로 함께 막는다.
 */
function safeNext(value: FormDataEntryValue | null): string {
  if (typeof value !== 'string') return '/';
  if (!value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

/** 303 이라야 브라우저가 GET 으로 다시 요청한다. 302 는 POST 를 되풀이한다. */
function backTo(path: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { location: path } });
}

export async function POST(request: Request): Promise<NextResponse> {
  const form = await request.formData();
  const theme = form.get('theme');
  const next = safeNext(form.get('next'));

  if (!isTheme(theme)) return backTo(next);

  const response = backTo(next);

  /*
   * **`system` 은 쿠키를 지우는 것이다.**
   *
   * `shop.theme=system` 을 심어도 결과는 같지만, 그러면 "고른 적 없음" 과
   * "시스템을 고름" 이 구별되지 않는다. 지워 두면 나중에 기본값을 바꾸거나
   * 쿠키를 세는 일이 생겨도 말이 맞는다.
   */
  if (theme === 'system') {
    response.cookies.delete({ name: THEME_COOKIE, path: '/' });
    return response;
  }

  response.cookies.set(THEME_COOKIE, theme, {
    path: '/',
    maxAge: YEAR,
    sameSite: 'lax',
    // 화면을 그리는 데만 쓰는 값이다. 막으면 클라이언트가 지금 밝기를 알 수 없다.
    httpOnly: false,
  });
  return response;
}
