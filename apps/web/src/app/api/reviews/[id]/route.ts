import { NextResponse } from 'next/server';
import { updateReviewSchema } from '@shop/contract';
import { hasPermission, ImageError, MAX_IMAGES_PER_REVIEW } from '@shop/core';
import { getActor, getSessionUser } from '@shop/auth/session';
import { readJsonWithImages } from '~/lib/images/read-body';
import { enforceRateLimit } from '~/lib/rate-limit';
import {
  uploadReviewImages, discardReviewImages, type UploadedImage,
} from '~/lib/reviews/images';
import {
  assertCanEditReview, updateReview, deleteReview, ReviewError,
} from '~/lib/reviews/write-review';
import { closeReportsAsRemoved } from '~/lib/reviews/report';
import { recordAudit } from '~/lib/audit';
import { revalidateReviews } from '~/lib/cache';
import { validationFailed } from '~/lib/i18n/validation';
import { invalidJson, unauthorized } from '~/lib/api/respond';

/**
 * 리뷰 수정.
 *
 * 글만 고치면 JSON, 사진까지 고치면 multipart 다 — 작성 창구와 같은 두 갈래다. 사진을 올리는 자리라 제한을 건다.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getSessionUser(request.headers);
  if (!user) {
    return await unauthorized();
  }

  const limited = await enforceRateLimit('review', request, user.id);
  if (limited) return limited;

  let body: unknown;
  let files: { bytes: Uint8Array; declaredType: string }[];
  try {
    const read = await readJsonWithImages(request, { max: MAX_IMAGES_PER_REVIEW, tooMany: 'TOO_MANY_REVIEW_IMAGES' });
    body = read.fields;
    files = read.files;
  } catch (error) {
    if (error instanceof ImageError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: 400 });
    }
    return await invalidJson();
  }

  const parsed = updateReviewSchema.safeParse(body);
  if (!parsed.success) {
    return validationFailed(parsed.error);
  }

  const { id } = await params;

  // 자격을 먼저 보고, 그다음에 올린다 — 남의 리뷰 id 로 파일만 올리는 길을 막는다
  let uploaded: UploadedImage[] = [];
  try {
    if (files.length > 0) {
      const review = await assertCanEditReview(user.id, id);
      uploaded = await uploadReviewImages(review.orderItemId, files);
    }

    const updated = await updateReview(user.id, id, parsed.data, uploaded);
    revalidateReviews();
    return NextResponse.json(updated);
  } catch (error) {
    // 고쳐지지 않았으면 올린 사진도 되돌린다
    if (uploaded.length > 0) await discardReviewImages(uploaded.map((u) => u.key));

    if (error instanceof ImageError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: 400 });
    }
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
    return await unauthorized();
  }

  const limited = await enforceRateLimit('review', request, actor.id);
  if (limited) return limited;

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
