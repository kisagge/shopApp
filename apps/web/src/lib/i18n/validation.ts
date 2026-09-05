import { NextResponse } from 'next/server';
import type { ZodError } from 'zod';
import { getT } from './server';
import { translateIssue, type IssueBounds } from './issue';

/**
 * 검증 실패 응답.
 *
 * **번역은 서버가 한다.** 계약의 Zod 문구는 사전 열쇠(`valid.*`)일 뿐이고,
 * 응답을 만드는 이 자리에서 요청의 언어로 바꾼다. 화면으로 열쇠를 내려보내면
 * 스무 곳 넘는 폼이 저마다 번역할 줄 알아야 하고, 하나만 빠뜨려도 사용자에게
 * `valid.tooLongChars` 같은 글자가 그대로 보인다.
 */

/**
 * 필드 이름으로 찾을 수 있게 **레코드로 준다.**
 *
 * 계약의 apiErrorSchema 가 그렇게 적어 두었는데 라우트 절반은 배열을 보내고
 * 있었다 — 그 배열을 읽는 화면은 하나도 없었다. 같은 것을 두 모양으로
 * 보내면 폼마다 어느 쪽인지 알아야 한다.
 *
 * 같은 칸에 여러 개가 걸리면 **첫 번째만 남긴다.** 한 번에 하나씩 고치게
 * 하는 편이 낫고, 폼들도 이미 그렇게 그린다.
 */
export async function validationFailed(error: ZodError): Promise<NextResponse> {
  const t = await getT();

  const fields: Record<string, string> = {};
  let first: string | null = null;
  for (const issue of error.issues) {
    const message = translateIssue(t, issue.message, issue as IssueBounds);
    first ??= message;
    const path = issue.path.join('.') || '_';
    fields[path] ??= message;
  }

  return NextResponse.json(
    { code: 'VALIDATION_FAILED', message: first ?? t('valid.generic'), fields },
    { status: 400 },
  );
}
