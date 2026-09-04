/**
 * 고객센터 규칙. 순수 로직만, I/O 없음.
 *
 * 문구는 없다 — 화면이 세 나라 말로 나가므로 갈래의 **이름표는 화면이 정한다.**
 */

/**
 * 무엇에 대한 물음인가.
 *
 * FAQ 분류와 1:1 문의 분류가 **같은 목록을 쓴다.** 자주 묻는 것을 모아 둔
 * 것이 FAQ 이므로 갈래가 달라질 이유가 없고, 나눠 두면 "배송" 을 고른 문의가
 * "배송" FAQ 옆에 놓이지 않는다.
 */
export const INQUIRY_TOPIC = [
  'DELIVERY',
  'EXCHANGE',
  'PAYMENT',
  'ACCOUNT',
  'PRODUCT',
  'ETC',
] as const;
export type InquiryTopic = (typeof INQUIRY_TOPIC)[number];

export const isInquiryTopic = (value: unknown): value is InquiryTopic =>
  typeof value === 'string' && (INQUIRY_TOPIC as readonly string[]).includes(value);

export const SUPPORT_POST_KIND = ['NOTICE', 'FAQ'] as const;
export type SupportPostKind = (typeof SUPPORT_POST_KIND)[number];

export const SUPPORT_TITLE_MAX_LENGTH = 120;
export const SUPPORT_BODY_MAX_LENGTH = 10_000;

/**
 * 내보낸 글인가.
 *
 * 초안과 게시를 **상태가 아니라 시각으로** 가른다. 언제 나갔는지가 함께
 * 남고, "게시됨인데 게시일이 없는" 상태를 애초에 만들 수 없다.
 * 상품의 publishedAt 과 같은 결이다.
 */
export function isPublishedPost(post: { publishedAt: Date | null }): boolean {
  return post.publishedAt !== null;
}

/**
 * FAQ 는 갈래가 있어야 하고, 공지는 있으면 안 된다.
 *
 * 한 표에 담은 값이므로 **어느 칸이 어느 종류의 것인지** 규칙으로 적어 둔다.
 * 적지 않으면 갈래 없는 FAQ 가 어느 묶음에도 안 들어가 조용히 사라진다.
 */
export function topicRequired(kind: SupportPostKind): boolean {
  return kind === 'FAQ';
}
