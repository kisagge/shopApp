import { z } from 'zod';
import { RATING_MIN, RATING_MAX, SIZE_FIT, MAX_IMAGES_PER_REVIEW, REPORT_REASON } from '@shop/core';
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

/**
 * 사진은 **파일로** 받는다.
 *
 * 주소를 받으면 안 된다 — 아무 주소나 적어 넣을 수 있고, 그러면 우리 화면이
 * 남의 서버 이미지를 우리 이름으로 띄우는 자리가 된다. 바이트를 직접 받아
 * 우리 저장소에 올린 것만 실린다.
 *
 * 그래서 이 스키마에는 이미지가 없다. 파일은 multipart 로 오고, 개수와
 * 형식은 업로드 경로가 검사한다(core 의 image 규칙).
 */
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

/** 리뷰 사진 개수 한도. 화면이 안내 문구에 쓴다. */
export const REVIEW_IMAGE_LIMIT = MAX_IMAGES_PER_REVIEW;

/**
 * 리뷰 신고.
 *
 * 사유는 고르게 한다 — 자유 입력만 받으면 분류가 안 되고, 무엇이 문제인지
 * 매번 읽어야 처리 순서를 정할 수 있다. 설명은 선택이다.
 */
export const reportReviewSchema = z.object({
  reason: z.enum(REPORT_REASON, { error: '신고 사유를 골라 주세요' }),
  detail: z
    .string()
    .trim()
    .max(500, '500자를 넘을 수 없습니다')
    .nullable()
    .default(null),
});
export type ReportReviewInput = z.infer<typeof reportReviewSchema>;

/** 운영진의 신고 처리. 글을 내리는 것은 삭제 API 가 따로 맡는다. */
export const dismissReportsSchema = z.object({
  note: z.string().trim().max(500).nullable().default(null),
});
export type DismissReportsInput = z.infer<typeof dismissReportsSchema>;
