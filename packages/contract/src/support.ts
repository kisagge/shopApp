import { z } from 'zod';
import {
  SUPPORT_POST_KIND, INQUIRY_TOPIC, topicRequired,
  SUPPORT_TITLE_MAX_LENGTH, isRichTextEmpty,
} from '@shop/core';
import { richTextSchema } from './rich-text';

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
    title: z.string().trim().min(2, 'valid.titleRequired').max(SUPPORT_TITLE_MAX_LENGTH, 'valid.tooLongChars'),
    /**
     * 본문은 **나무 하나로만** 들어온다.
     *
     * 평문(`body`)도 저장하지만 그것은 서버가 나무에서 뽑는다. 둘 다 받으면
     * 어느 날 서로 다른 말을 하게 되고, 그때 목록은 옛 글을 보여 주면서
     * 본문은 새 글을 보여 준다.
     */
    bodyRich: richTextSchema.refine((doc) => !isRichTextEmpty(doc), {
      message: 'valid.bodyRequired',
    }),
    topic: z.enum(INQUIRY_TOPIC).nullish(),
    pinned: z.boolean().default(false),
    sortOrder: z.number().int('valid.integerOnly').min(0, 'valid.tooSmall').max(9_999, 'valid.tooBig').default(0),
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
