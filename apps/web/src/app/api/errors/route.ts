import { NextResponse } from 'next/server';
import { isIgnorableError } from '@shop/core';
import { browserErrorSchema } from '@shop/contract';
import { enforceRateLimit } from '~/lib/rate-limit';
import { reportBrowserError } from '~/lib/errors';

/**
 * 브라우저에서 난 오류를 받는다.
 *
 * **이 창구가 없으면 그쪽 오류는 영영 모른다.** 서버 오류는 instrumentation 이 받아 로그와 메일로 나가지만,
 * 브라우저에서 터진 것은 그 기기에서만 일어난 일이다. 앱(웹뷰)에서는 특히 그렇다 — 개발자 도구도 없고 배포 로그에도
 * 안 남는다. 화면이 하얗게 뜬 채로 사용자는 "안 돼요" 라고만 말할 수 있다.
 *
 * **누가 보냈는지는 묻지 않는다.** 로그인 여부와 무관하게 받고, 사용자 id 도 남기지 않는다 — 고치는 데 필요한 것은
 * 어느 화면에서 무엇이 터졌는가이지 누구인지가 아니다. 경로는 가려서 저장한다(주문번호·이메일이 주소에 섞인다).
 *
 * 답은 늘 204 다. 브라우저에게 돌려줄 말이 없고, 오류를 보내다 또 오류가 나면 안 된다.
 */
export async function POST(request: Request): Promise<NextResponse> {
  // 제한을 일을 시작하기 전에 건다
  const limited = await enforceRateLimit('browserError', request, null);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const parsed = browserErrorSchema.safeParse(body);
  // 형식이 이상하면 조용히 버린다 — 창구가 열려 있어 아무 값이나 들어온다
  if (!parsed.success) return new NextResponse(null, { status: 204 });

  /*
   * 서버 쪽과 같은 목록으로 거른다. 프리페치 취소처럼 우리 오류가 아닌 것이 브라우저에서도 올라온다.
   */
  if (isIgnorableError(Object.assign(new Error(parsed.data.message), { name: parsed.data.name }))) {
    return new NextResponse(null, { status: 204 });
  }

  await reportBrowserError({
    name: parsed.data.name,
    message: parsed.data.message,
    stack: parsed.data.stack,
    routePath: parsed.data.routePath,
  });

  return new NextResponse(null, { status: 204 });
}
