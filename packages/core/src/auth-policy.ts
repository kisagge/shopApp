/**
 * 가입 정책.
 *
 * Better Auth 도 길이를 검사하지만 그 값은 서버 설정이고, 화면은 사용자가
 * 제출하기 전에 같은 기준으로 말해 줘야 한다. 기준을 여기 한 곳에 두고
 * 계약과 화면이 함께 가져다 쓴다 — 두 벌로 적으면 반드시 어긋난다.
 */

/** Better Auth 의 minPasswordLength 와 같은 값이어야 한다. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const NAME_MAX_LENGTH = 30;

/** 가입 축하 포인트. */
export const SIGNUP_POINTS = 3_000;

/**
 * 비밀번호가 이메일에서 그대로 나오는가.
 *
 * 복잡도 규칙(대문자·특수문자·숫자)을 요구하지 않는다. 그런 규칙은 사람들이
 * `Password1!` 같은 것을 만들게 해서 실제로 더 뻔해지고, 길이를 벌충해 주지도
 * 않는다. 대신 **실제로 가장 먼저 시도되는 것 하나**를 막는다 — 이메일
 * 아이디를 그대로 쓰는 것.
 *
 * 대소문자를 무시한다. `Demo` 와 `demo` 는 공격자에게 같은 후보다.
 */
export function isDerivedFromEmail(password: string, email: string): boolean {
  const local = email.split('@')[0]?.toLowerCase() ?? '';
  if (local.length < 3) return false;

  const lowered = password.toLowerCase();
  // 아이디를 품고 있으면 걸러낸다. demo1234 도, xxdemo 도 마찬가지다.
  return lowered.includes(local);
}
