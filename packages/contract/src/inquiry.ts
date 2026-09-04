import { z } from 'zod';
import { INQUIRY_MAX_LENGTH, ANSWER_MAX_LENGTH } from '@shop/core';
import { cuidSchema } from './common';

/**
 * 상품 문의 계약.
 *
 * 비공개 여부를 **보내는 쪽이 정한다.** 기본은 공개다 — 같은 것을 궁금해하는
 * 사람이 보고 다시 묻지 않아도 되는 것이 문의를 공개로 두는 이유다.
 */
export const createInquirySchema = z.object({
  productId: cuidSchema,
  content: z
    .string()
    .trim()
    .min(5, '5자 이상 적어 주세요')
    .max(INQUIRY_MAX_LENGTH, `${INQUIRY_MAX_LENGTH}자를 넘을 수 없습니다`),
  isPrivate: z.boolean().default(false),
});
export type CreateInquiryInput = z.infer<typeof createInquirySchema>;

export const answerInquirySchema = z.object({
  answer: z
    .string()
    .trim()
    .min(1, '답변을 적어 주세요')
    .max(ANSWER_MAX_LENGTH, `${ANSWER_MAX_LENGTH}자를 넘을 수 없습니다`),
});
export type AnswerInquiryInput = z.infer<typeof answerInquirySchema>;
