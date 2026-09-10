import { NextResponse } from 'next/server';
import { sessionCookie } from '@shop/auth';
import { getSessionUser } from '@shop/auth/session';
import { enforceRateLimit } from '~/lib/rate-limit';

/**
 * 네이티브 셸이 들고 있던 토큰을 **세션 쿠키로 되돌린다.**
 *
 * ── 왜 필요한가 ────────────────────────────────────────────────
 * 웹뷰는 앱을 다시 띄울 때 쿠키를 잃는 일이 있다. 그래서 셸은 로그인 응답의
 * 토큰을 네이티브 저장소에 넣어 두고, 클라이언트는 그것을 Bearer 로 보낸다.
 *
 * **그것만으로는 모자랐다.** Bearer 는 `authClient` 가 부르는 auth 창구에만
 * 실린다. 이 앱의 화면 쉰한 장은 전부 서버가 그리고 **쿠키를 읽는다** —
 * 실기기에서 재 보니 쿠키를 지운 뒤 헤더는 되살아나는데 `/mypage` 는
 * `/login` 으로 넘어갔다. 로그인한 것처럼 보이지만 갈 수 있는 곳이 없었다.
 *
 * ── 무엇을 하는가 ──────────────────────────────────────────────
 * 토큰을 검증하고, 맞으면 그 값을 세션 쿠키로 심는다.
 *
 * **새 권한을 주지 않는다.** better-auth 의 bearer 플러그인이 하는 일이
 * "토큰을 세션 쿠키로 바꾸는 것"이고(그 파일 첫 줄에 그렇게 적혀 있다),
 * 저장된 토큰은 **서명된 쿠키 값 그 자체**다. 그러니 이 창구는 이미 가진
 * 자격을 브라우저가 쓸 수 있는 모양으로 옮겨 줄 뿐이다.
 *
 * **검증 먼저.** `getSessionUser` 가 Bearer 를 보고 세션을 돌려줄 때만 심는다.
 * 아무 문자열이나 쿠키로 앉히면 서버가 나중에 거절하더라도 그때까지
 * 로그인한 것처럼 보인다.
 *
 * **쿠키 이름과 속성은 손으로 적지 않는다.** 배포 여부에 따라 `__Secure-`
 * 가 붙고 속성도 설정에 딸려 바뀐다. 같은 설정으로 라이브러리에게 묻는다
 * (`@shop/auth` 의 sessionCookie).
 *
 * **POST 다.** 남의 사이트가 폼으로 부를 수 없게 한다 — Authorization 헤더는
 * 교차 출처 폼이 붙일 수 없고, GET 이 아니라 링크로도 부를 수 없다.
 */
/**
 * better-auth 의 쿠키 속성을 Next 가 아는 모양으로 옮긴다.
 *
 * 값은 그대로 쓰고 **모양만** 맞춘다 — better-auth 는 `sameSite` 에 대문자도
 * 허용하는데 Next 는 소문자만 받고, `prefix` 는 이름을 지을 때 쓰는 값이라
 * 응답 쿠키에는 자리가 없다(이름은 이미 지어져 있다).
 */
function toNextCookie(a: typeof sessionCookie.attributes) {
  const { sameSite, prefix: _prefix, ...rest } = a;
  return {
    ...rest,
    ...(sameSite ? { sameSite: sameSite.toLowerCase() as 'lax' | 'strict' | 'none' } : {}),
  };
}

export async function POST(request: Request): Promise<NextResponse> {
  /*
   * **일을 시작하기 전에 건다.** 여기는 토큰을 넣어 보는 자리라, 검증까지
   * 가 보고 나서 세는 것은 이미 늦다. 부르는 쪽이 로그인 전이라 사용자를
   * 모르므로 주소로 센다.
   */
  const limited = await enforceRateLimit('nativeSession', request, null);
  if (limited) return limited;

  const header = request.headers.get('authorization') ?? '';
  if (!header.toLowerCase().startsWith('bearer ')) {
    return NextResponse.json({ code: 'NO_TOKEN' }, { status: 401 });
  }

  const token = header.slice(7).trim();
  if (!token) return NextResponse.json({ code: 'NO_TOKEN' }, { status: 401 });

  // bearer 플러그인이 이 헤더를 세션 쿠키로 바꿔 읽는다
  const user = await getSessionUser(request.headers);
  if (!user) return NextResponse.json({ code: 'BAD_TOKEN' }, { status: 401 });

  const response = new NextResponse(null, { status: 204 });
  response.cookies.set(sessionCookie.name, token, toNextCookie(sessionCookie.attributes));
  return response;
}
