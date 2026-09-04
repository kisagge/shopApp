import { NextResponse } from 'next/server';
import { isLocale, LOCALE_COOKIE } from '@shop/i18n';

/**
 * 언어를 고른다.
 *
 * **평범한 폼 전송이다.** 자바스크립트 없이도 언어를 바꿀 수 있어야 한다 —
 * 화면 낭독기나 스크립트가 막힌 환경에서 언어만 못 바꾸는 것은 이상하다.
 * 그래서 클라이언트 컴포넌트가 아니라 POST 한 번으로 끝낸다.
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

/**
 * 되돌려 보낸다.
 *
 * **Location 에 상대 경로를 넣는다.** 절대 주소로 만들려면 origin 을 알아야
 * 하는데, 이 앱은 배포마다 다른 주소로도 열린다 — 그때 요청이 들어온 주소를
 * 그대로 박으면 사용자가 보던 주소에서 벗어난다. 예전에 결제 콜백에서 겪은
 * 일이다. 상대 경로는 브라우저가 지금 보고 있는 곳을 기준으로 푼다.
 *
 * 303 이라야 브라우저가 GET 으로 다시 요청한다. 302 는 POST 를 그대로
 * 반복하는 브라우저가 있다.
 */
function backTo(path: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { location: path } });
}

export async function POST(request: Request) {
  const form = await request.formData();
  const locale = form.get('locale');
  const next = safeNext(form.get('next'));

  if (!isLocale(locale)) return backTo(next);

  const response = backTo(next);
  response.cookies.set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: YEAR,
    sameSite: 'lax',
    // 화면을 그리는 데만 쓰는 값이라 스크립트가 읽어도 위험하지 않다.
    // httpOnly 로 막으면 클라이언트에서 지금 언어를 알 방법이 없어진다.
    httpOnly: false,
  });
  return response;
}
