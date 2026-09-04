import 'server-only';
import { resolveBaseUrl } from '@shop/auth';

/**
 * 메일에 넣을 절대 주소.
 *
 * 메일 본문의 링크는 상대 경로일 수 없다 — 받는 사람의 메일함에는 기준이
 * 될 주소가 없다.
 *
 * **인증이 쓰는 것과 같은 기준을 쓴다.** 여기서 따로 조립하면 프리뷰 배포
 * 에서 두 값이 어긋나, 메일 링크를 눌렀을 때 로그인 세션이 없는 주소로
 * 떨어진다. 같은 함수를 쓰면 그럴 일이 없다.
 */
export function absoluteUrl(path: string): string {
  const base = resolveBaseUrl() ?? 'http://localhost:3000';
  return new URL(path, base).toString();
}
