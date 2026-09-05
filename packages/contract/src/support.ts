import { z } from 'zod';
import {
  SUPPORT_POST_KIND, INQUIRY_TOPIC, topicRequired,
  SUPPORT_TITLE_MAX_LENGTH, SUPPORT_BODY_MAX_LENGTH,
} from '@shop/core';

/**
 * 고객센터 글 계약.
 *
 * **갈래 규칙을 계약이 강제한다.** FAQ 에는 갈래가 있어야 하고 공지에는
 * 없어야 한다 — 화면에서만 막으면 API 를 직접 부르는 쪽으로 갈래 없는 FAQ 가
 * 들어오고, 그 글은 어느 묶음에도 안 붙어 아무에게도 안 보인다.
 */
export const supportPostSchema = z
  .object({
    kind: z.enum(SUPPORT_POST_KIND),
    title: z.string().trim().min(2, 'valid.titleRequired').max(SUPPORT_TITLE_MAX_LENGTH),
    body: z.string().trim().min(2, 'valid.bodyRequired').max(SUPPORT_BODY_MAX_LENGTH),
    topic: z.enum(INQUIRY_TOPIC).nullish(),
    pinned: z.boolean().default(false),
    sortOrder: z.number().int().min(0).max(9_999).default(0),
    /** 지금 내보낼지. 끄면 초안으로 남는다. */
    published: z.boolean().default(false),
  })
  .refine((v) => !topicRequired(v.kind) || v.topic != null, {
    message: 'valid.faqNeedsTopic',
    path: ['topic'],
  })
  .refine((v) => topicRequired(v.kind) || v.topic == null, {
    message: 'valid.noticeNoTopic',
    path: ['topic'],
  });
export type SupportPostInput = z.infer<typeof supportPostSchema>;
