import { hasPermission, ownsMerchant, type Actor } from './authz';

/**
 * 리뷰 판매자 답글 — 누가 답할 수 있는가. 순수 로직만.
 *
 * **파는 사람이 답한다.** 가맹점은 자기 상품의 리뷰에만, 운영진은 어느 상품에나(자사 브랜드는 운영진만). 문의 답변과
 * 같은 선이다(canAnswerInquiry) — 남의 브랜드 상품 리뷰에 가맹점이 답하면 그 브랜드를 대신 말하는 셈이 된다.
 *
 * 내려진 리뷰에는 답하지 않는다. 보이지 않는 글에 단 답은 맥락 없이 남는다.
 */
export function canReplyToReview(
  actor: Actor,
  review: { readonly merchantId: string | null; readonly removed: boolean },
): boolean {
  return !review.removed && hasPermission(actor, 'review:reply') && ownsMerchant(actor, review.merchantId);
}

/** 답글 한 편의 상한. 해명은 짧아야 읽힌다 */
export const REVIEW_REPLY_MAX = 1_000;
