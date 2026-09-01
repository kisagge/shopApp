import { z } from 'zod';
import { RATING_MIN, RATING_MAX, SIZE_FIT } from '@shop/core';
import { cuidSchema } from './common';

/**
 * 리뷰 작성 계약.
 *
 * **어느 주문 항목에 대한 리뷰인지를 받는다.** 상품 id 만 받으면 그 상품을
 * 산 적 있는지를 서버가 따로 뒤져야 하고, 여러 번 산 경우 어느 구매의
 * 후기인지도 알 수 없다. 주문 항목이 곧 "이 구매"의 신원이다.
 */

const reviewShape = {
  rating: z.int().min(RATING_MIN, '별점을 선택해 주세요').max(RATING_MAX),
  content: z
    .string()
    .trim()
    .min(10, '10자 이상 적어 주세요')
    .max(2000, '2000자를 넘을 수 없습니다'),
  sizeFit: z.enum(SIZE_FIT).nullable(),
  /** cm — 체형은 사이즈 판단에 실제로 도움이 된다. 선택 사항이다. */
  height: z.int().min(100).max(250).nullable(),
  /** kg */
  weight: z.int().min(20).max(300).nullable(),
};

export const createReviewSchema = z.object({
  orderItemId: cuidSchema,
  ...reviewShape,
  sizeFit: reviewShape.sizeFit.default(null),
  height: reviewShape.height.default(null),
  weight: reviewShape.weight.default(null),
});
export type CreateReviewInput = z.infer<typeof createReviewSchema>;

/** 수정은 부분 갱신. 기본값을 두지 않는다 — .partial() 이 걷어내지 않는다. */
export const updateReviewSchema = z.object(reviewShape).partial();
export type UpdateReviewInput = z.infer<typeof updateReviewSchema>;

export const REVIEW_SORT = ['recent', 'rating_desc', 'rating_asc'] as const;
export type ReviewSort = (typeof REVIEW_SORT)[number];

export const REVIEW_SORT_LABEL: Readonly<Record<ReviewSort, string>> = {
  recent: '최신순',
  rating_desc: '높은 평점순',
  rating_asc: '낮은 평점순',
};

export const reviewListQuerySchema = z.object({
  sort: z.enum(REVIEW_SORT).catch('recent'),
  cursor: z.string().optional(),
});
