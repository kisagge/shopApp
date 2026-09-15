import { NextResponse } from 'next/server';
import { replyReviewSchema } from '@shop/contract';
import { getActor } from '@shop/auth/session';
import { replyToReview, deleteReviewReply, ReviewReplyError } from '~/lib/reviews/reply';
import { recordAudit } from '~/lib/audit';
import { revalidateReviews } from '~/lib/cache';
import { validationFailed } from '~/lib/i18n/validation';
import { unauthorized } from '~/lib/api/respond';

type Params = { params: Promise<{ id: string }> };

/**
 * 리뷰 판매자 답글 — 쓰기·고치기(PUT), 지우기(DELETE).
 *
 * 상품 화면의 리뷰 목록은 캐시되어 있어 저장 뒤 턴다 — 안 털면 가맹점은 답했는데 손님에게는 한동안 안 보인다.
 * 무엇에서 무엇으로 바꿨는지 감사 로그에 남긴다: 가맹점이 손님에게 공개로 한 말이다.
 */
export async function PUT(request: Request, { params }: Params): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return await unauthorized();
  }
  const parsed = replyReviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return validationFailed(parsed.error);
  }
  const { id } = await params;

  try {
    const { before, after } = await replyToReview(actor, id, parsed.data.reply);
    revalidateReviews();
    await recordAudit({ actor, action: 'review.reply', targetType: 'review', targetId: id, before, after, request });
    return NextResponse.json(after);
  } catch (error) {
    return failed(error);
  }
}

export async function DELETE(request: Request, { params }: Params): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return await unauthorized();
  }
  const { id } = await params;

  try {
    const { before } = await deleteReviewReply(actor, id);
    revalidateReviews();
    await recordAudit({ actor, action: 'review.reply.delete', targetType: 'review', targetId: id, before, request });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return failed(error);
  }
}

function failed(error: unknown): NextResponse {
  if (error instanceof ReviewReplyError) {
    return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
  }
  throw error;
}
