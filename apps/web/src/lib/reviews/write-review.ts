import 'server-only';
import { prisma } from '@shop/db';
import {
  isReviewableStatus, ratingScore,
  REVIEW_ERROR_MESSAGE, type ReviewErrorCode, type OrderStatus,
} from '@shop/core';
import type { CreateReviewInput, UpdateReviewInput } from '@shop/contract';

export class ReviewError extends Error {
  constructor(readonly code: ReviewErrorCode, readonly status = 400) {
    super(REVIEW_ERROR_MESSAGE[code]);
    this.name = 'ReviewError';
  }
}

export interface ReviewRow {
  readonly id: string;
  readonly rating: number;
  readonly content: string;
  readonly sizeFit: string | null;
  readonly height: number | null;
  readonly weight: number | null;
  readonly createdAt: Date;
  readonly productId: string;
}

const select = {
  id: true, rating: true, content: true, sizeFit: true,
  height: true, weight: true, createdAt: true, productId: true,
} as const;

/**
 * 상품의 평점 집계를 다시 계산한다.
 *
 * **증감이 아니라 원본을 다시 센다.** 증감은 빠르지만 한 번 어긋나면 스스로
 * 알아채지 못하고, 리뷰 수정·삭제까지 얽히면 어긋날 경로가 여럿이다.
 * 상품당 리뷰 수는 유한하므로 다시 세는 비용이 그 위험보다 싸다.
 * 포인트 잔액에서 이미 겪은 문제다.
 *
 * 리뷰 쓰기와 같은 트랜잭션 안에서 돈다.
 */
async function recountRating(tx: typeof prisma, productId: string): Promise<void> {
  const agg = await tx.review.aggregate({
    where: { productId, deletedAt: null },
    _sum: { rating: true },
    _count: { _all: true },
  });

  const sum = agg._sum.rating ?? 0;
  const count = agg._count._all;

  await tx.product.update({
    where: { id: productId },
    data: { ratingSum: sum, reviewCount: count, ratingScore: ratingScore(sum, count) },
  });
}

/**
 * 리뷰 작성.
 *
 * 세 가지를 확인한다 — 내 주문인가, 배송이 끝났는가, 이미 썼는가.
 * 마지막은 orderItemId 의 유니크 제약이 DB 에서도 한 번 더 막는다.
 */
export async function createReview(
  userId: string,
  input: CreateReviewInput,
): Promise<ReviewRow> {
  const item = await prisma.orderItem.findUnique({
    where: { id: input.orderItemId },
    select: {
      id: true, status: true,
      // OrderItem 은 상품을 직접 가리키지 않는다. 옵션(변형)을 거쳐야 한다 —
      // 주문은 "어떤 옵션을 샀는가"의 기록이기 때문이다.
      variant: { select: { productId: true } },
      order: { select: { userId: true, status: true } },
      review: { select: { id: true } },
    },
  });

  if (!item) throw new ReviewError('NOT_PURCHASED', 404);
  // 남의 주문 항목 id 를 알아내도 쓸 수 없다
  if (item.order.userId !== userId) throw new ReviewError('NOT_PURCHASED', 403);
  if (!isReviewableStatus(item.order.status as OrderStatus)) {
    throw new ReviewError('NOT_DELIVERED', 409);
  }
  // 운영진이 내린 리뷰는 행이 남아 이 검사에 걸린다 — 다시 올릴 수 없다.
  // 본인이 지운 것은 행이 없으므로 다시 쓸 수 있다.
  if (item.review) throw new ReviewError('ALREADY_REVIEWED', 409);

  const productId = item.variant.productId;

  return prisma.$transaction(async (tx) => {
    const review = await tx.review.create({
      data: {
        userId,
        productId,
        orderItemId: input.orderItemId,
        rating: input.rating,
        content: input.content,
        sizeFit: input.sizeFit,
        height: input.height,
        weight: input.weight,
      },
      select,
    });

    await recountRating(tx as typeof prisma, productId);
    return review;
  });
}

export async function updateReview(
  userId: string,
  reviewId: string,
  input: UpdateReviewInput,
): Promise<ReviewRow> {
  const before = await prisma.review.findFirst({
    where: { id: reviewId, deletedAt: null },
    select: { id: true, userId: true, productId: true },
  });
  if (!before) throw new ReviewError('REVIEW_NOT_FOUND', 404);
  if (before.userId !== userId) throw new ReviewError('NOT_OWN_REVIEW', 403);

  // 보내지 않은 필드는 키 자체를 뺀다. null 은 "지운다"는 뜻이라 그대로 실어야 한다.
  const data = Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );

  return prisma.$transaction(async (tx) => {
    const review = await tx.review.update({ where: { id: reviewId }, data, select });
    // 별점을 고쳤을 수 있다
    await recountRating(tx as typeof prisma, before.productId);
    return review;
  });
}

/**
 * 리뷰 삭제.
 *
 * **누가 지우느냐에 따라 다르게 지운다.**
 *
 * - 본인이 지우면 행을 없앤다. 주문 항목당 하나라는 유니크 제약 때문에
 *   흔적을 남기면 같은 구매로 다시 쓸 수 없게 된다. 마음이 바뀌어 지웠다가
 *   다시 쓰려는 사람을 영영 막을 이유가 없다. 실제로 돌려 보고 알았다.
 * - 운영진이 지우면 표시만 한다. 사유가 있어 내린 글이므로 같은 구매로
 *   다시 올릴 수 있으면 안 되고, 신고·분쟁 때 원본이 남아 있어야 한다.
 */
export async function deleteReview(
  actor: { userId: string; canModerate: boolean },
  reviewId: string,
): Promise<void> {
  const review = await prisma.review.findFirst({
    where: { id: reviewId, deletedAt: null },
    select: { id: true, userId: true, productId: true },
  });
  if (!review) throw new ReviewError('REVIEW_NOT_FOUND', 404);

  const isOwner = review.userId === actor.userId;
  if (!isOwner && !actor.canModerate) throw new ReviewError('NOT_OWN_REVIEW', 403);

  await prisma.$transaction(async (tx) => {
    if (isOwner) {
      await tx.review.delete({ where: { id: reviewId } });
    } else {
      await tx.review.update({ where: { id: reviewId }, data: { deletedAt: new Date() } });
    }
    await recountRating(tx as typeof prisma, review.productId);
  });
}
