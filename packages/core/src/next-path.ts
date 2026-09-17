/**
 * 로그인 뒤에 돌아갈 곳. 순수 로직만.
 *
 * 로그인이 필요한 화면은 `/login?next=<원래 주소>` 로 보낸다(스물두 곳). 그런데 두 가지가 틀려 있었다.
 *
 * · **이메일 로그인은 next 를 보지 않았다.** 늘 홈으로 갔다 — 결제하려다 로그인하면 결제 화면이
 *   아니라 홈이 열렸고, "바로 구매" 를 붙이면서 그 길이 막다른 곳이 됐다.
 * · **구글 로그인은 next 를 거르지 않았다.** 주소에 실린 값이라 누구든 `?next=https://다른곳` 을
 *   만들 수 있고, 그 값을 그대로 `location.assign` 에 넘겼다 — 우리 로그인 화면을 거쳐 남의 사이트로
 *   보내는 열린 리디렉트다.
 *
 * 그래서 **우리 사이트 안의 경로만** 받는다. 아니면 홈이다.
 */
const CONTROL_OR_BACKSLASH = /[\\\p{Cc}]/u;

export function safeNextPath(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512) return '/';
  // 경로여야 한다. `//evil.test` 는 브라우저가 다른 호스트로 읽는다
  if (!value.startsWith('/') || value.startsWith('//')) return '/';
  // `/\evil.test` 는 일부 브라우저가 `//` 로 고쳐 읽는다. 제어 문자는 주소를 쪼개는 데 쓰인다
  if (CONTROL_OR_BACKSLASH.test(value)) return '/';
  // 로그인 화면으로 되돌아가면 돌고 돈다
  if (value === '/login' || value.startsWith('/login?') || value.startsWith('/login/')) return '/';
  return value;
}
