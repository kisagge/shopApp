import { NextResponse } from 'next/server';
import { closeAccountSchema } from '@shop/contract';
import { auth } from '@shop/auth';
import { getSessionUser } from '@shop/auth/session';
import { closeAccount, ClosureError } from '~/lib/account/close-account';
import { revalidateReviews } from '~/lib/cache';
import { validationFailed } from '~/lib/i18n/validation';
import { unauthorized } from '~/lib/api/respond';

/**
 * 회원 탈퇴.
 *
 * 되돌릴 수 없는 동작이라 **본인 세션으로만** 받는다. 관리자가 대신 눌러
 * 주는 길은 만들지 않는다 — 남의 계정을 지우는 문을 열어 두면 그 문이
 * 감사 로그보다 먼저 쓰인다.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const user = await getSessionUser(request.headers);
  if (!user) {
    return await unauthorized();
  }

  const parsed = closeAccountSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return validationFailed(parsed.error);
  }

  try {
    const result = await closeAccount(user.id, parsed.data);

    /*
     * **리뷰를 지웠으면 카탈로그를 턴다.**
     *
     * 탈퇴는 이 사람의 리뷰를 지우고 상품의 별점·리뷰 수를 다시 계산한다.
     * DB 는 맞아지는데 캐시는 그대로라, 최대 캐시 수명(1시간)만큼 **요약은
     * 지워진 리뷰까지 세고 목록은 안 센다** — 화면이 "리뷰 6" 이라고 적어
     * 놓고 글은 다섯 개인 상태가 된다.
     *
     * 리뷰를 쓰고 지우는 다른 창구들은 이미 털고 있었는데, 이 길만 빠져
     * 있었다. 캐시 검사가 창구 목록을 손으로 들고 있어서 여기를 아예 보지
     * 않았다 — 그 목록도 함께 고쳤다(test/cache-coverage.test.ts).
     */
    if (result.erasedReviews > 0) revalidateReviews();

    const response = NextResponse.json({ closed: true, ...result });
    await expireSessionCookie(request, response);
    return response;
  } catch (error) {
    if (error instanceof ClosureError) {
      return NextResponse.json(
        { code: error.code, message: error.message, blocks: error.blocks },
        { status: error.status },
      );
    }
    throw error;
  }
}

/**
 * 이 브라우저의 세션 쿠키를 지금 끊는다.
 *
 * **세션 행을 지우는 것만으로는 부족하다.** Better Auth 의 쿠키 캐시(5분)는
 * 매 요청마다 DB 를 보지 않아서, 탈퇴 직후에도 남은 쿠키가 5분 동안 로그인
 * 상태로 통한다 — 실제로 curl 로 마이페이지가 200 으로 열리는 것을 봤다.
 *
 * 화면 쪽에서도 로그아웃을 부르지만 거기에만 기대지 않는다. 화면을 거치지
 * 않는 요청도 같은 문을 쓴다.
 *
 * 쿠키를 지우는 방법은 Better Auth 가 알고 있으므로 그쪽의 응답 헤더를
 * 그대로 옮긴다. 이름과 옵션을 여기 손으로 적으면 설정이 바뀔 때 어긋난다.
 */
async function expireSessionCookie(request: Request, response: NextResponse): Promise<void> {
  try {
    const signedOut = await auth.api.signOut({ headers: request.headers, asResponse: true });
    for (const cookie of signedOut.headers.getSetCookie()) {
      response.headers.append('set-cookie', cookie);
    }
  } catch {
    // 계정은 이미 지워졌다. 쿠키는 캐시가 끝나면 어차피 죽는다.
  }
}
