import type { MessageKey, Translator } from '@shop/i18n';

/**
 * 계약이 돌려준 문구를 사람의 말로 바꾼다.
 *
 * 계약(@shop/contract)의 Zod 문구는 사전 열쇠(`valid.*`)일 뿐이다. 서버가
 * 응답을 만들 때도, 클라이언트가 **보내기 전에 미리 거를 때**도 같은
 * 변환이 필요하다 — 한쪽만 하면 그 길로 들어온 사용자에게
 * `valid.tooLongChars` 같은 글자가 그대로 보인다.
 *
 * 열쇠가 아닌 문구는 **그대로 통과시킨다.** 계약 밖에서 온 문장(업무 규칙이
 * 던지는 오류 같은 것)은 아직 한국어인데, 열쇠로 착각해 지워 버리면
 * 아무 말도 하지 않는 오류가 된다.
 *
 * 열쇠인지 아닌지는 **번역기가 쥔 사전에게 묻는다**(`t.has`). 예전에는
 * `messageKeys()` 로 만든 상수를 봤는데, 그러면 열쇠 이름만 필요한 자리에
 * 한국어 사전 한 벌이 통째로 딸려 온다.
 */

/** 길이 제한 같은 숫자는 Zod 가 이슈에 실어 준다. 문구에 박지 않는다. */
export type IssueBounds = {
  readonly minimum?: unknown;
  readonly maximum?: unknown;
};

export function translateIssue(t: Translator, message: string, bounds: IssueBounds = {}): string {
  if (!t.has(message)) return message;

  const params: Record<string, number> = {};
  if (typeof bounds.minimum === 'number') params['min'] = bounds.minimum;
  if (typeof bounds.maximum === 'number') params['max'] = bounds.maximum;
  return t(message as MessageKey, params);
}
