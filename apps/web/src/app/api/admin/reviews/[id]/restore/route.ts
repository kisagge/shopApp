import { NextResponse } from 'next/server';
import { getActor } from '@shop/auth/session';
import { assertPermission, ForbiddenError } from '@shop/core';
import { restoreReview, ReviewError } from '~/lib/reviews/write-review';
import { recordAudit } from '~/lib/audit';
import { revalidateReviews } from '~/lib/cache';
import { unauthorized } from '~/lib/api/respond';

/** 내린 글을 되돌린다. 잘못 내린 것을 고칠 수 있어야 한다. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return await unauthorized();
  }

  const { id } = await params;

  try {
    assertPermission(actor, 'review:moderate');
    await restoreReview(id);
    // 별점이 목록에도 나온다
    revalidateReviews();

    await recordAudit({
      actor, action: 'review.restore', targetType: 'review', targetId: id, request,
    });
    return NextResponse.json({ restored: true });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ code: 'FORBIDDEN', message: error.message }, { status: 403 });
    }
    if (error instanceof ReviewError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    throw error;
  }
}
