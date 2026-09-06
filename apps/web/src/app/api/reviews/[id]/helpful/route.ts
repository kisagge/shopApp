import { NextResponse } from 'next/server';
import { getSessionUser } from '@shop/auth/session';
import { enforceRateLimit } from '~/lib/rate-limit';
import { markHelpful, unmarkHelpful, HelpfulError } from '~/lib/reviews/helpful';
import { unauthorized } from '~/lib/api/respond';

/**
 * 도움이 됐다.
 *
 * **PUT 으로 켜고 DELETE 로 끈다.** 토글 하나로 두면 같은 요청이 두 번
 * 닿았을 때 뒤집혀서, 네트워크가 불안한 곳에서 누른 표가 사라진다.
 * 두 번 켜도 켜진 채인 편이 낫다.
 *
 * 로그인 확인과 요청 제한을 **핸들러마다 적는다.** 공유 헬퍼로 빼면 세 줄이
 * 줄지만, 핸들러만 읽어서는 검사가 걸려 있는지 알 수 없다 — 실제로 자리
 * 검사가 이 라우트를 "제한이 없다" 고 판정했다. 검사는 눈에 보이는 자리에
 * 있어야 빠뜨리지 않는다.
 */

type Params = { params: Promise<{ id: string }> };



async function respond(
  params: Params['params'],
  userId: string,
  run: (reviewId: string, userId: string) => Promise<number>,
): Promise<NextResponse> {
  const { id } = await params;
  try {
    return NextResponse.json({ helpfulCount: await run(id, userId) });
  } catch (error) {
    if (error instanceof HelpfulError) {
      return NextResponse.json(
        { code: error.code, message: error.message },
        { status: error.status },
      );
    }
    throw error;
  }
}

export async function PUT(request: Request, { params }: Params): Promise<NextResponse> {
  const user = await getSessionUser(request.headers);
  if (!user) return unauthorized();

  const limited = await enforceRateLimit('vote', request, user.id);
  if (limited) return limited;

  return respond(params, user.id, markHelpful);
}

export async function DELETE(request: Request, { params }: Params): Promise<NextResponse> {
  const user = await getSessionUser(request.headers);
  if (!user) return unauthorized();

  const limited = await enforceRateLimit('vote', request, user.id);
  if (limited) return limited;

  return respond(params, user.id, unmarkHelpful);
}
