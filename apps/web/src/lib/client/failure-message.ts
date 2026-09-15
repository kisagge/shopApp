/**
 * 실패한 응답에서 사람에게 보여 줄 말을 꺼낸다.
 *
 * 창구는 `{ code, message }` 로 답하지만 **늘 JSON 이 오지는 않는다** — 앞단이 502 HTML 을 주거나 본문이 비면
 * `response.json()` 이 던지고, 그걸 잡지 않으면 서버가 한 말 대신 "네트워크 오류" 가 뜬다(실제로 이용 정지 폼이 그랬다).
 * 말이 없으면 부르는 쪽이 준 기본 문구를 쓴다.
 */
export async function failureMessage(response: Response, fallback: string): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  const message = typeof body === 'object' && body !== null ? (body as { message?: unknown }).message : undefined;
  return typeof message === 'string' && message.trim() !== '' ? message : fallback;
}
