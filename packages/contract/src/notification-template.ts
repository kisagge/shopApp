import { z } from 'zod';
import { NOTIFICATION_KIND } from '@shop/core';

/**
 * 알림 문구 템플릿 저장.
 *
 * `body` 가 null 이면 **기본 문구로 되돌린다**(줄을 지운다). 빈 문자열과 가르는 이유 — 빈 칸으로 저장한 것이
 * "문구 없음" 인지 "되돌리기" 인지 서버가 추측하게 두지 않는다. 자리 이름·중괄호 검사는 종류를 알아야 해서 core 의
 * checkTemplate 이 저장하는 쪽에서 한다.
 *
 * 말 목록은 @shop/i18n 의 LOCALES 와 같아야 한다(web 검사가 맞춘다). 계약은 사전에 기대지 않는다.
 */
export const TEMPLATE_LOCALES = ['ko', 'en', 'ja'] as const;

export const updateNotificationTemplateSchema = z.object({
  kind: z.enum(NOTIFICATION_KIND),
  locale: z.enum(TEMPLATE_LOCALES),
  body: z.string().max(1_000, 'valid.tooLongChars').nullable(),
});

export type UpdateNotificationTemplateInput = z.infer<typeof updateNotificationTemplateSchema>;
