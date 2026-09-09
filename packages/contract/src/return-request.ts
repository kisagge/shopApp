import { z } from 'zod';
import { RETURN_TYPE, RETURN_REASON } from '@shop/core';

/**
 * 반품·교환 신청 계약.
 *
 * **반송비 부담 주체를 받지 않는다.** 사유에서 서버가 정한다 — 요청으로
 * 받으면 누구나 "판매자 부담" 을 보내 반송비를 넘길 수 있다.
 */
export const returnRequestSchema = z.object({
  type: z.enum(RETURN_TYPE),
  reason: z.enum(RETURN_REASON),
  detail: z.string().trim().max(500, 'valid.tooLongChars').optional(),
});
export type ReturnRequestInput = z.infer<typeof returnRequestSchema>;

/** 운영진의 처리 */
export const resolveReturnSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('APPROVE') }),
  z.object({
    action: z.literal('REJECT'),
    /**
     * 반려는 이유 없이 못 한다. 고객이 왜 안 되는지 알아야 다음 행동을 정한다.
     *
     * 아예 빠졌을 때의 문구도 우리 말로 지정한다. 안 그러면 Zod 의 영어
     * 원문("expected string, received undefined")이 그대로 화면에 나간다.
     */
    rejectReason: z
      .string({ error: 'valid.rejectReasonRequired' })
      .trim()
      .min(1, 'valid.rejectReasonRequired')
      .max(300, 'valid.tooLongChars'),
  }),
]);
export type ResolveReturnInput = z.infer<typeof resolveReturnSchema>;
