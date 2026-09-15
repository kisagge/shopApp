import 'server-only';
import { prisma } from '@shop/db';
import { canReplyToReview, type Actor } from '@shop/core';
import { recordNotification } from '~/lib/notifications/record';

export class ReviewReplyError extends Error {
  constructor(readonly code: 'REVIEW_NOT_FOUND' | 'NOT_ALLOWED' | 'NO_REPLY', message: string, readonly status: number) {
    super(message);
    this.name = 'ReviewReplyError';
  }
}

export interface ReplySnapshot {
  readonly reply: string | null;
  readonly repliedAt: Date | null;
  readonly replyEditedAt: Date | null;
}

async function loadReview(reviewId: string) {
  return prisma.review.findUnique({
    where: { id: reviewId },
    select: {
      id: true, userId: true, deletedAt: true, reply: true, repliedAt: true, replyEditedAt: true,
      product: { select: { name: true, slug: true, brand: { select: { merchantId: true } } } },
    },
  });
}

/**
 * 답할 수 있는 리뷰인지 본다.
 *
 * **남의 가맹점 리뷰는 없는 리뷰로 답한다** — 403 으로 답하면 id 를 넣어 보는 것만으로 그 리뷰가 있는지, 어느 가맹점
 * 것인지 알 수 있다. 내려진 리뷰는 운영진에게도 거절이지만 이유를 말한다(운영 화면에서 보이는 글이다).
 */
async function loadForReply(actor: Actor, reviewId: string) {
  const review = await loadReview(reviewId);
  const merchantId = review?.product.brand.merchantId ?? null;
  if (!review || !canReplyToReview(actor, { merchantId, removed: false })) {
    throw new ReviewReplyError('REVIEW_NOT_FOUND', '리뷰를 찾을 수 없습니다.', 404);
  }
  if (review.deletedAt !== null) {
    throw new ReviewReplyError('NOT_ALLOWED', '내려진 리뷰에는 답글을 달 수 없습니다.', 409);
  }
  return review;
}

/**
 * 답글 쓰기·고치기.
 *
 * **처음 답할 때만 알린다.** 고칠 때마다 알림이 가면 오타 하나 고친 것으로 쓴 사람의 알림함이 찬다. 고친 사실은
 * 화면에 "수정됨" 으로 적는다(replyEditedAt).
 */
export async function replyToReview(
  actor: Actor,
  reviewId: string,
  reply: string,
  now: Date = new Date(),
): Promise<{ before: ReplySnapshot; after: ReplySnapshot }> {
  const review = await loadForReply(actor, reviewId);
  const first = review.reply === null;

  const after: ReplySnapshot = {
    reply,
    repliedAt: first ? now : review.repliedAt,
    replyEditedAt: first ? null : now,
  };
  await prisma.review.update({
    where: { id: reviewId },
    data: { ...after, repliedById: actor.id },
  });

  // 알림은 곁다리 — 못 남겨도 답글은 저장됐다(recordNotification 이 삼킨다)
  if (first && review.userId !== actor.id) {
    await recordNotification({
      userId: review.userId,
      kind: 'REVIEW_REPLIED',
      params: { productName: review.product.name },
      linkPath: `/product/${review.product.slug}`,
    });
  }

  return {
    before: { reply: review.reply, repliedAt: review.repliedAt, replyEditedAt: review.replyEditedAt },
    after,
  };
}

/** 답글 지우기. 원문은 그대로 — 답만 걷는다 */
export async function deleteReviewReply(
  actor: Actor,
  reviewId: string,
): Promise<{ before: ReplySnapshot }> {
  const review = await loadForReply(actor, reviewId);
  if (review.reply === null) throw new ReviewReplyError('NO_REPLY', '지울 답글이 없습니다.', 409);
  await prisma.review.update({
    where: { id: reviewId },
    data: { reply: null, repliedAt: null, replyEditedAt: null, repliedById: null },
  });
  return { before: { reply: review.reply, repliedAt: review.repliedAt, replyEditedAt: review.replyEditedAt } };
}
