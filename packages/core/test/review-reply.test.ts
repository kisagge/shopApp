import { describe, it, expect } from 'vitest';
import { canReplyToReview, type Actor } from '../src';

/** 리뷰 판매자 답글 — 파는 사람이 자기 상품에만 */
const merchant: Actor = { id: 'm', role: 'MERCHANT', merchantId: 'm-a' };
const admin: Actor = { id: 'a', role: 'ADMIN', merchantId: null };
const customer: Actor = { id: 'c', role: 'CUSTOMER', merchantId: null };

describe('canReplyToReview', () => {
  it('가맹점은 자기 상품 리뷰에만 답한다', () => {
    expect(canReplyToReview(merchant, { merchantId: 'm-a', removed: false })).toBe(true);
    expect(canReplyToReview(merchant, { merchantId: 'm-b', removed: false })).toBe(false);
    // 자사 브랜드(가맹점 없음)는 운영진 몫
    expect(canReplyToReview(merchant, { merchantId: null, removed: false })).toBe(false);
  });

  it('운영진은 어느 상품에나, 손님은 못 한다', () => {
    expect(canReplyToReview(admin, { merchantId: 'm-b', removed: false })).toBe(true);
    expect(canReplyToReview(admin, { merchantId: null, removed: false })).toBe(true);
    expect(canReplyToReview(customer, { merchantId: null, removed: false })).toBe(false);
  });

  it('내려진 리뷰에는 아무도 답하지 않는다 — 보이지 않는 글에 단 답은 맥락 없이 남는다', () => {
    expect(canReplyToReview(admin, { merchantId: 'm-a', removed: true })).toBe(false);
    expect(canReplyToReview(merchant, { merchantId: 'm-a', removed: true })).toBe(false);
  });
});
