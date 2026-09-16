import 'server-only';
import { prisma } from '@shop/db';
import { discardReviewImages } from './images';
import {
  ImageError, isReviewableStatus, planReviewImages, ratingScore, reviewChanged,
  REVIEW_ERROR_MESSAGE, type ReviewErrorCode,
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
  readonly editedAt: Date | null;
  readonly productId: string;
}

const select = {
  id: true, rating: true, content: true, sizeFit: true,
  height: true, weight: true, createdAt: true, editedAt: true, productId: true,
  images: { select: { url: true, blurDataUrl: true }, orderBy: { sortOrder: 'asc' } },
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
/**
 * 이 사람이 이 주문 항목에 리뷰를 쓸 수 있는가.
 *
 * createReview 가 하던 검사를 꺼냈다. **사진을 올리기 전에** 같은 판단이
 * 필요하기 때문이다 — 순서가 반대면 리뷰를 쓸 수 없는 사람의 파일이
 * 저장소에 남는다. createReview 는 이 함수를 다시 부른다. 검사가 두 번
 * 도는 것이 파일이 남는 것보다 낫다.
 */
export async function assertCanReview(
  userId: string,
  orderItemId: string,
): Promise<{ productId: string }> {
  const item = await prisma.orderItem.findUnique({
    where: { id: orderItemId },
    select: {
      id: true, status: true, canceledAt: true,
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
  if (!isReviewableStatus(item.order.status)) {
    throw new ReviewError('NOT_DELIVERED', 409);
  }
  /*
   * 주문은 배송완료여도 **그 줄은 돈이 돌아갔을 수 있다**(출고 전 일부 취소, 받은 뒤 일부 반품).
   * 돌려보낸 물건의 후기는 산 사람의 후기가 아니다. 목록에서 거르는 것만으로는 id 를 알고 직접
   * 보내는 요청을 못 막는다.
   */
  if (item.canceledAt) throw new ReviewError('NOT_PURCHASED', 409);
  // 운영진이 내린 리뷰는 행이 남아 이 검사에 걸린다 — 다시 올릴 수 없다.
  // 본인이 지운 것은 행이 없으므로 다시 쓸 수 있다.
  if (item.review) throw new ReviewError('ALREADY_REVIEWED', 409);

  return { productId: item.variant.productId };
}

export async function createReview(
  userId: string,
  input: CreateReviewInput,
  /**
   * 이미 올라간 사진. 자격 검사를 통과한 뒤에 올린 것만 들어온다.
   *
   * 이 함수가 직접 올리지 않는다 — 트랜잭션 안에서 외부 저장소를 두드리면
   * 롤백해도 파일은 남는다. 올리는 것은 바깥에서, 여기서는 기록만 한다.
   */
  images: readonly { url: string; key: string; blurDataUrl: string | null }[] = [],
): Promise<ReviewRow> {
  const { productId } = await assertCanReview(userId, input.orderItemId);

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
        images: {
          // 순서가 곧 화면에 보이는 차례다. 넘겨받은 순서를 그대로 박는다.
          create: images.map((i, sortOrder) => ({
            url: i.url,
            storageKey: i.key,
            blurDataUrl: i.blurDataUrl,
            sortOrder,
          })),
        },
      },
      select,
    });

    await recountRating(tx as typeof prisma, productId);
    return review;
  });
}

export interface EditableReview {
  readonly id: string;
  readonly productId: string;
  readonly orderItemId: string;
  readonly images: readonly { id: string; storageKey: string }[];
}

/**
 * 이 사람이 이 리뷰를 고칠 수 있는가.
 *
 * **사진을 올리기 전에** 같은 판단이 필요해서 꺼냈다 — 작성 쪽의 assertCanReview 와 같은 이유다. 순서가 반대면 남의 리뷰
 * id 를 적어 파일만 올리는 길이 열린다. 올릴 자리(orderItemId)도 함께 내보낸다.
 *
 * 운영진이 내린 글(deletedAt)은 여기 걸리지 않는다. 사유가 있어 내린 글을 고쳐서 되살릴 수 있으면 안 된다.
 */
export async function assertCanEditReview(userId: string, reviewId: string): Promise<EditableReview> {
  const review = await prisma.review.findFirst({
    where: { id: reviewId, deletedAt: null },
    select: {
      id: true, userId: true, productId: true, orderItemId: true,
      images: { select: { id: true, storageKey: true }, orderBy: { sortOrder: 'asc' } },
    },
  });
  if (!review) throw new ReviewError('REVIEW_NOT_FOUND', 404);
  if (review.userId !== userId) throw new ReviewError('NOT_OWN_REVIEW', 403);

  return review;
}

export async function updateReview(
  userId: string,
  reviewId: string,
  input: UpdateReviewInput,
  /** 이미 올라간 사진. 작성과 같이, 트랜잭션 밖에서 올린 것만 들어온다 */
  added: readonly { url: string; key: string; blurDataUrl: string | null }[] = [],
): Promise<ReviewRow> {
  const before = await assertCanEditReview(userId, reviewId);

  const { keepImageIds, ...fields } = input;
  // 보내지 않은 필드는 키 자체를 뺀다. null 은 "지운다"는 뜻이라 그대로 실어야 한다.
  const data = Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  );

  /*
   * 사진 키가 아예 없으면 손대지 않는다 — 글만 고치는 요청(JSON)이 사진을 통째로 날리면 안 된다.
   * 빈 배열은 "전부 뺀다" 는 뜻이라 그대로 따른다.
   */
  const plan = keepImageIds === undefined
    ? planReviewImages(before.images, before.images.map((i) => i.id), added.length)
    : planReviewImages(before.images, keepImageIds, added.length);
  if (plan.overLimit) throw new ImageError('TOO_MANY_REVIEW_IMAGES');

  const imagesChanged = plan.remove.length > 0 || added.length > 0;
  const current = await prisma.review.findUniqueOrThrow({
    where: { id: reviewId },
    select: { rating: true, content: true, sizeFit: true, height: true, weight: true },
  });

  const review = await prisma.$transaction(async (tx) => {
    if (plan.remove.length > 0) {
      await tx.reviewImage.deleteMany({ where: { id: { in: plan.remove.map((i) => i.id) } } });
      /*
       * 남은 것에 0부터 다시 번호를 매긴다. 가운데 한 장을 빼면 번호에 구멍이 생기는데(0,2),
       * 그 뒤에 새 사진을 1번으로 붙이면 화면에서는 새 사진이 옛 사진 앞으로 끼어든다.
       */
      await Promise.all(
        plan.keep.map((image, sortOrder) =>
          tx.reviewImage.update({ where: { id: image.id }, data: { sortOrder } }),
        ),
      );
    }
    if (added.length > 0) {
      await tx.reviewImage.createMany({
        data: added.map((image, at) => ({
          reviewId,
          url: image.url,
          storageKey: image.key,
          blurDataUrl: image.blurDataUrl,
          // 남은 사진 뒤에 붙는다 — 순서가 곧 화면에 보이는 차례다
          sortOrder: plan.keep.length + at,
        })),
      });
    }

    const updated = await tx.review.update({
      where: { id: reviewId },
      data: {
        ...data,
        // 실제로 달라졌을 때만 "수정됨" 을 붙인다
        ...(reviewChanged(current, data, imagesChanged) ? { editedAt: new Date() } : {}),
      },
      select,
    });
    // 별점을 고쳤을 수 있다
    await recountRating(tx as typeof prisma, before.productId);
    return updated;
  });

  /*
   * 뺀 사진은 기록이 지워진 뒤에 저장소에서 지운다. 실패해도 넘어간다 — 화면에서 사라지는 것이 먼저고,
   * 남은 객체는 눈에 보이는 피해가 없다. 삭제와 같은 판단이다.
   */
  if (plan.remove.length > 0) {
    await discardReviewImages(plan.remove.map((i) => i.storageKey));
  }

  return review;
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
    select: {
      id: true, userId: true, productId: true,
      images: { select: { storageKey: true } },
    },
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

  /**
   * 사진은 본인이 지웠을 때만 함께 지운다.
   *
   * 운영진이 내린 글은 행을 남긴다 — 신고·분쟁 때 원본이 있어야 하기
   * 때문이다. 그런데 사진을 지워 버리면 남은 것은 반쪽짜리 기록이 된다.
   *
   * 저장소 삭제는 실패해도 넘어간다. 화면에서 사라지는 것이 우선이고,
   * 남은 객체는 눈에 보이는 피해가 없다.
   */
  if (isOwner && review.images.length > 0) {
    await discardReviewImages(review.images.map((i) => i.storageKey));
  }
}

/**
 * 운영진이 내린 글을 되돌린다.
 *
 * **잘못 내리는 일은 실제로 일어난다.** 신고 사유만 보고 눌렀다가 원문을
 * 읽고 판단이 바뀌는 경우가 대부분이고, 그때 되돌릴 문이 없으면 글쓴이는
 * 영영 잃는다 — 같은 구매로 다시 쓸 수도 없다(유니크 제약).
 *
 * 본인이 지운 글은 행이 없어 여기 걸리지 않는다. 되돌릴 것도 없고,
 * 다시 쓰면 된다.
 */
export async function restoreReview(reviewId: string): Promise<void> {
  const review = await prisma.review.findFirst({
    where: { id: reviewId, deletedAt: { not: null } },
    select: { id: true, productId: true },
  });
  if (!review) throw new ReviewError('REVIEW_NOT_FOUND', 404);

  await prisma.$transaction(async (tx) => {
    await tx.review.update({ where: { id: reviewId }, data: { deletedAt: null } });
    // 내려간 동안 집계에서 빠져 있었다
    await recountRating(tx as typeof prisma, review.productId);
  });
}
