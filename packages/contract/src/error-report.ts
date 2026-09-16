import { z } from 'zod';
import { MAX_ERROR_MESSAGE, MAX_ERROR_STACK } from '@shop/core';
/**
 * 브라우저가 보내는 오류.
 *
 * **아무나 보낼 수 있는 창구다.** 길이를 자르고, 경로는 우리 화면 주소 모양일 때만 받는다 — 바깥 주소를 그대로
 * 저장하면 오류함이 남의 글을 싣는 게시판이 된다.
 */
export const browserErrorSchema = z.object({
  name: z.string().trim().min(1, 'valid.tooShortChars').max(100, 'valid.tooLongChars'),
  message: z.string().trim().min(1, 'valid.tooShortChars').max(MAX_ERROR_MESSAGE, 'valid.tooLongChars'),
  stack: z.string().max(MAX_ERROR_STACK, 'valid.tooLongChars').nullable().default(null),
  /** 오류가 난 화면. 우리 주소만 받는다 */
  routePath: z
    .string()
    .trim()
    .max(200, 'valid.tooLongChars')
    .regex(/^\/[^\s?#]*$/, 'valid.pathFormat'),
});
export type BrowserErrorInput = z.infer<typeof browserErrorSchema>;
