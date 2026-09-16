import { z } from 'zod';
import { POLICY_KIND, SUPPORT_TITLE_MAX_LENGTH, isRichTextEmpty } from '@shop/core';
import { richTextSchema } from './rich-text';

/**
 * 약관·개인정보처리방침 저장 계약.
 *
 * **시행일을 받는다.** 올린 날을 그대로 쓰면 "며칠 뒤부터 이렇게 바뀝니다" 를 표현할 수 없다 — 개인정보처리방침은 바꾸기
 * 전에 미리 알려야 하므로, 올리는 날과 효력이 생기는 날이 다른 것이 정상이다.
 *
 * 본문은 공지와 같이 **나무 하나로만** 들어온다(평문은 서버가 뽑는다 — supportPostSchema 주석).
 */
export const policySchema = z.object({
  title: z.string().trim().min(2, 'valid.titleRequired').max(SUPPORT_TITLE_MAX_LENGTH, 'valid.tooLongChars'),
  bodyRich: richTextSchema.refine((doc) => !isRichTextEmpty(doc), { message: 'valid.bodyRequired' }),
  /** 'YYYY-MM-DD'. 시각까지 받지 않는다 — 방침은 날짜 단위로 시행한다 */
  effectiveOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'valid.dateFormat'),
});
export type PolicyInput = z.infer<typeof policySchema>;

/** 주소의 종류 조각. 화면이 아니라 계약이 아는 값만 받는다 */
export const policyKindSchema = z.enum(POLICY_KIND);
