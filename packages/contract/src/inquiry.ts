import { z } from 'zod';
import { INQUIRY_MAX_LENGTH, ANSWER_MAX_LENGTH, INQUIRY_TOPIC } from '@shop/core';
import { cuidSchema } from './common';

/**
 * 상품 문의 계약.
 *
 * 비공개 여부를 **보내는 쪽이 정한다.** 기본은 공개다 — 같은 것을 궁금해하는
 * 사람이 보고 다시 묻지 않아도 되는 것이 문의를 공개로 두는 이유다.
 */
export const createInquirySchema = z
  .object({
    /**
     * 어떤 상품에 대한 물음인가. **없을 수 있다** — 배송이나 환불처럼
     * 상품과 무관한 물음은 고객센터로 들어온다.
     */
    productId: cuidSchema.nullish(),
    /** 상품이 없을 때 무엇에 대한 물음인지 */
    topic: z.enum(INQUIRY_TOPIC).nullish(),
    content: z
      .string()
      .trim()
      .min(5, '5자 이상 적어 주세요')
      .max(INQUIRY_MAX_LENGTH, `${INQUIRY_MAX_LENGTH}자를 넘을 수 없습니다`),
    isPrivate: z.boolean().default(false),
  })
  /*
   * 둘 중 하나는 있어야 한다. 상품도 갈래도 없는 문의는 **누가 답해야 하는지
   * 알 수 없다** — 상품이 있으면 파는 사람이, 없으면 갈래를 보고 운영진이
   * 집는다. 어디에도 안 붙는 문의는 대기줄에서 조용히 늙는다.
   */
  .refine((v) => v.productId != null || v.topic != null, {
    message: '문의할 상품이나 갈래를 정해 주세요',
    path: ['topic'],
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
