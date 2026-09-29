import 'server-only';
import type { NextResponse } from 'next/server';
import type { ZodType } from 'zod';
import { invalidJson } from './respond';
import { validationFailed } from '~/lib/i18n/validation';

/**
 * 요청 본문을 읽고 계약으로 거른다.
 *
 * **같은 열 줄이 마흔여덟 곳에 있었다** — 본문을 읽다 실패하면 400, 계약에 안 맞으면 어느 칸이
 * 틀렸는지와 함께 400. 두 갈래 다 창구마다 다를 이유가 없는데도 창구마다 적혀 있었고, 그래서
 * 본문 크기 상한이나 빈 본문 처리 같은 것을 걸 자리가 마흔여덟 곳이었다.
 *
 * **돌려주는 모양이 `parsed` 를 그대로 잇는다.** 통과하면 `.data` 에 계약이 거른 값이 있고,
 * 막히면 `.response` 가 이미 만들어진 응답이다 — 부르는 쪽은 두 줄만 적는다:
 *
 * ```ts
 * const parsed = await readBody(request, createBannerSchema);
 * if (!parsed.ok) return parsed.response;
 * // parsed.data
 * ```
 *
 * **조용히 버려야 하는 창구는 이것을 쓰지 않는다.** 오류 수집·CSP 신고·결제 웹훅은 형식이
 * 이상해도 브라우저나 결제사에게 돌려줄 말이 없어서 204·200 으로 끝낸다. 그 셋은 각자의 사정이다.
 */
export async function readBody<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<{ readonly ok: true; readonly data: T } | { readonly ok: false; readonly response: NextResponse }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, response: await invalidJson() };
  }

  const parsed = schema.safeParse(body);
  // 문구는 계약의 열쇠에서 나오고, 번역은 이 응답을 만들 때 한다
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, response: await validationFailed(parsed.error) };
}
