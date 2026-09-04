import { NextResponse } from 'next/server';
import { reportReviewSchema } from '@shop/contract';
import { getSessionUser } from '@shop/auth/session';
import { enforceRateLimit } from '~/lib/rate-limit';
import { reportReview, ReviewReportError } from '~/lib/reviews/report';

/**
 * 리뷰 신고.
 *
 * 로그인한 사람만 신고할 수 있다. 익명으로 열어 두면 대기줄을 채우는 데
 * 아무 비용이 들지 않고, 누가 눌렀는지 몰라 중복도 막을 수 없다.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getSessionUser(request.headers);
  if (!user) {
    return NextResponse.json({ code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' }, { status: 401 });
  }

  // 본문을 읽기 전에 센다 — 뒤에 두면 형식이 틀린 요청이 세어지지 않는다
  const limited = await enforceRateLimit('report', request, user.id);
  if (limited) return limited;

  const parsed = reportReviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { code: 'VALIDATION_FAILED', message: parsed.error.issues[0]?.message ?? '입력값을 확인해 주세요.' },
      { status: 400 },
    );
  }

  const { id } = await params;

  try {
    return NextResponse.json(await reportReview(user.id, id, parsed.data));
  } catch (error) {
    if (error instanceof ReviewReportError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    throw error;
  }
}
