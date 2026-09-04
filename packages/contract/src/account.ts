import { z } from 'zod';
import { CLOSURE_CONFIRM_PHRASE, CLOSURE_ERROR } from '@shop/core';

/**
 * 회원 탈퇴 계약.
 *
 * 확인 문구를 **서버에서도 본다.** 화면에서만 검사하면 주소를 직접 부르는
 * 요청은 그대로 통과하고, 되돌릴 수 없는 동작에 확인이 없어진다.
 */
export const closeAccountSchema = z.object({
  phrase: z.string().trim().refine((v) => v === CLOSURE_CONFIRM_PHRASE, {
    message: CLOSURE_ERROR.PHRASE_MISMATCH,
  }),
  /** 리뷰도 함께 지울 것인가. 보내지 않으면 남기고 이름만 지운다. */
  eraseReviews: z.boolean().default(false),
});
export type CloseAccountInput = z.infer<typeof closeAccountSchema>;
