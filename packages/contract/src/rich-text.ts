import { z } from 'zod';
import {
  RICH_TEXT_NODE, RICH_TEXT_MARK, RICH_TEXT_HEADING_LEVEL,
  RICH_TEXT_MAX_DEPTH, RICH_TEXT_MAX_NODES,
  SUPPORT_BODY_MAX_LENGTH,
  isSafeHref, richTextToPlainText,
  type RichTextDoc, type RichTextNode,
} from '@shop/core';

/**
 * 서식 있는 글의 계약.
 *
 * **허용 목록이 곧 스키마다.** 편집기가 만든 HTML 을 받아서 소독하는 대신,
 * core 가 정한 어휘로만 이뤄진 나무를 받는다. 여기를 통과하지 못한 것은
 * 저장되지 않으므로, 화면은 "무엇이 들어 있을지 모르는 문자열" 을 다루지
 * 않는다.
 *
 * 그래서 **화면이 소독을 안 해도 된다** — 애초에 마크업이 될 수 있는 문자열이
 * 들어오지 않는다. 소독을 화면마다 기억해서 하는 것보다, 한 번 걸러 두고
 * 그 뒤로는 타입을 믿는 편이 낫다.
 */

const markSchema = z
  .object({
    type: z.enum(RICH_TEXT_MARK),
    attrs: z
      .object({
        /*
         * **href 만은 끝까지 문자열이다.** 나무로 주고받아도 이것 하나는
         * `<a href>` 가 되므로, 받아 줄 프로토콜을 core 가 정하고 여기서
         * 강제한다. `javascript:` 를 막지 않으면 "누르면 실행되는 공지" 다.
         */
        href: z.string().refine(isSafeHref, 'valid.unsafeLink'),
        target: z.string().nullish(),
        rel: z.string().nullish(),
        class: z.string().nullish(),
      })
      .partial()
      .nullish(),
  })
  .refine((mark) => mark.type !== 'link' || typeof mark.attrs?.href === 'string', {
    message: 'valid.linkNeedsHref',
    path: ['attrs', 'href'],
  });

/**
 * 나무는 자기를 품는다 — 목록 안에 문단, 그 안에 글자.
 *
 * `z.lazy` 로 자기를 가리키되 **깊이를 따로 센다.** Zod 는 깊이를 모르므로
 * 여기서 막지 않으면 목록 안의 목록을 몇 천 겹으로 쌓은 본문 하나가 서버를
 * 붙잡는다.
 */
const nodeSchema: z.ZodType<RichTextNode> = z.lazy(() =>
  z.object({
    type: z.enum(RICH_TEXT_NODE),
    text: z.string().nullish(),
    attrs: z
      .object({
        // core 가 h1 을 빼 둔 이유는 rich-text.ts 주석에 있다
        level: z.union(RICH_TEXT_HEADING_LEVEL.map((l) => z.literal(l))).nullish(),
        start: z
          .number()
          .int('valid.integerOnly')
          .min(1, 'valid.tooSmall')
          .max(9_999, 'valid.tooBig')
          .nullish(),
      })
      .partial()
      .nullish(),
    marks: z.array(markSchema).max(RICH_TEXT_MARK.length, 'valid.tooManyNodes').nullish(),
    content: z.array(nodeSchema).nullish(),
  }),
);

interface RawNode {
  readonly content?: readonly RawNode[] | null | undefined;
}

/** 노드 수와 깊이를 한 번에 센다 */
function measure(nodes: readonly RawNode[], depth = 1): { count: number; depth: number } {
  let count = nodes.length;
  let deepest = depth;
  for (const node of nodes) {
    const children = node.content;
    if (!children || children.length === 0) continue;
    const inner = measure(children, depth + 1);
    count += inner.count;
    deepest = Math.max(deepest, inner.depth);
  }
  return { count, depth: deepest };
}

export const richTextSchema: z.ZodType<RichTextDoc> = z
  .object({
    type: z.literal('doc'),
    content: z.array(nodeSchema),
  })
  /*
   * **제약마다 문구를 따로 붙인다.** 한 덩어리로 검사하면 무엇이 걸렸는지
   * 사람에게 말해 줄 수 없고, 계약의 문구 가드도 그것을 잡는다.
   */
  .refine((doc) => measure(doc.content).count <= RICH_TEXT_MAX_NODES, {
    message: 'valid.tooManyNodes',
    path: ['content'],
  })
  .refine((doc) => measure(doc.content).depth <= RICH_TEXT_MAX_DEPTH, {
    message: 'valid.tooDeep',
    path: ['content'],
  })
  /*
   * **길이는 평문으로 센다.** 나무의 JSON 크기를 세면 서식을 붙일수록 쓸 수
   * 있는 말이 줄어든다 — 글씨를 굵게 했다고 글이 짧아져야 할 이유가 없다.
   */
  .refine((doc) => richTextToPlainText(doc).length <= SUPPORT_BODY_MAX_LENGTH, {
    message: 'valid.tooLongChars',
    path: ['content'],
  });

export type RichTextInput = z.infer<typeof richTextSchema>;
