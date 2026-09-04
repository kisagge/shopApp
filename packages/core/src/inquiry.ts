import { hasPermission, ownsMerchant, type Actor } from './authz';

/**
 * 상품 문의 규칙. 순수 로직만, I/O 없음.
 *
 * 리뷰는 산 사람만 쓸 수 있게 막아 뒀는데, 그러면 **사기 전에 물어볼 자리가
 * 남지 않는다.** 재고·사이즈·배송을 묻는 문의는 구매 직전에 가장 많다.
 */

export const INQUIRY_MAX_LENGTH = 1_000;
export const ANSWER_MAX_LENGTH = 2_000;

/**
 * 답변할 수 있는가.
 *
 * **자기 상품만 답한다.** 가맹점이 남의 상품 문의에 답하면 그 브랜드를
 * 대신 말하는 셈이 된다. 범위 판단은 상품 관리와 같은 규칙을 쓴다 —
 * 여기서 따로 적으면 한쪽만 고치게 된다.
 */
export function canAnswerInquiry(actor: Actor, product: { merchantId: string | null }): boolean {
  return hasPermission(actor, 'inquiry:answer') && ownsMerchant(actor, product.merchantId);
}

/**
 * 문의 내용을 볼 수 있는가.
 *
 * **비공개 문의는 쓴 사람과 답할 사람만 본다.** 사이즈나 배송을 물으면서
 * 몸 치수나 사는 곳을 적는 일이 흔한데, 그게 상품 페이지에 그대로 남으면
 * 안 된다. 공개 문의는 누구나 본다 — 같은 것을 궁금해하는 사람이 있다.
 */
export function canReadInquiry(
  viewer: Actor | null,
  inquiry: { authorId: string; isPrivate: boolean },
  product: { merchantId: string | null },
): boolean {
  if (!inquiry.isPrivate) return true;
  if (!viewer) return false;
  if (viewer.id === inquiry.authorId) return true;
  return canAnswerInquiry(viewer, product);
}

/**
 * 지울 수 있는가.
 *
 * 본인은 언제나. 운영진은 `review:moderate` 로 — 문의도 남에게 보이는 글이라
 * 신고할 만한 것이 올라올 수 있고, 그 판단은 리뷰와 같은 사람이 한다.
 */
export function canDeleteInquiry(actor: Actor, inquiry: { authorId: string }): boolean {
  return actor.id === inquiry.authorId || hasPermission(actor, 'review:moderate');
}

/** 답변이 달린 문의인가 */
export function isAnswered(inquiry: { answeredAt: Date | null }): boolean {
  return inquiry.answeredAt !== null;
}

/*
 * 비공개 문의를 남이 볼 때 보여 줄 문구는 여기 없다.
 *
 * 예전에는 이 자리에 한국어 한 줄이 있었고 조회가 그 문자열을 본문 대신
 * 실어 보냈다. 화면이 세 나라 말로 나가면서 그 줄만 한국어로 남는다 —
 * 조회는 **볼 수 있는지 여부**만 알려 주고, 못 볼 때 뭐라고 적을지는
 * 화면이 정한다.
 */

export const INQUIRY_ERROR = {
  PRODUCT_NOT_FOUND: '상품을 찾을 수 없습니다.',
  INQUIRY_NOT_FOUND: '문의를 찾을 수 없습니다.',
  NOT_ALLOWED: '이 문의에 답할 권한이 없습니다.',
  NOT_OWN_INQUIRY: '내가 쓴 문의만 지울 수 있습니다.',
  ALREADY_ANSWERED: '이미 답변이 달린 문의입니다.',
} as const;
export type InquiryErrorCode = keyof typeof INQUIRY_ERROR;
