import { NextResponse } from 'next/server';
import { updateReviewSchema } from '@shop/contract';
import { hasPermission } from '@shop/core';
import { getActor, getSessionUser } from '@shop/auth/session';
import { updateReview, deleteReview, ReviewError } from '~/lib/reviews/write-review';
import { closeReportsAsRemoved } from '~/lib/reviews/report';
import { recordAudit } from '~/lib/audit';
import { revalidateReviews } from '~/lib/cache';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getSessionUser(request.headers);
  if (!user) {
    return NextResponse.json({ code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: 'INVALID_JSON', message: '요청 본문을 읽을 수 없습니다.' }, { status: 400 });
  }

  const parsed = updateReviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { code: 'VALIDATION_FAILED', message: parsed.error.issues[0]?.message ?? '입력값을 확인해 주세요.' },
      { status: 400 },
    );
  }

  const { id } = await params;

  try {
    const updated = await updateReview(user.id, id, parsed.data);
    revalidateReviews();
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof ReviewError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    throw error;
  }
}

/**
 * 리뷰 삭제.
 *
 * 본인이거나 운영진(review:moderate)이면 지울 수 있다.
 * 운영진이 지운 경우에는 감사 로그를 남긴다 — 남의 글을 지우는 일이다.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return NextResponse.json({ code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' }, { status: 401 });
  }

  const canModerate = hasPermission(actor, 'review:moderate');
  const { id } = await params;

  try {
    await deleteReview({ userId: actor.id, canModerate }, id);
    revalidateReviews();

    if (canModerate) {
      // 이미 끝난 건이 대기줄에 남으면 같은 일을 두 번 처리하게 된다
      await closeReportsAsRemoved(actor.id, id);
      await recordAudit({
        actor, action: 'review.delete', targetType: 'review', targetId: id, request,
      });
    }
    return NextResponse.json({ deleted: true });
  } catch (error) {
    if (error instanceof ReviewError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    throw error;
  }
}
