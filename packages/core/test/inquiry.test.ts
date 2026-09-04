import { describe, it, expect } from 'vitest';
import {
  canAnswerInquiry, canReadInquiry, canDeleteInquiry, isAnswered,
  INQUIRY_ERROR,
} from '../src/inquiry';
import { permissionsOf, type Actor } from '../src/authz';

const customer: Actor = { id: 'u-c', role: 'CUSTOMER', merchantId: null };
const other: Actor = { id: 'u-o', role: 'CUSTOMER', merchantId: null };
const merchantA: Actor = { id: 'u-a', role: 'MERCHANT', merchantId: 'm-a' };
const merchantB: Actor = { id: 'u-b', role: 'MERCHANT', merchantId: 'm-b' };
const admin: Actor = { id: 'u-adm', role: 'ADMIN', merchantId: null };

const mine = { authorId: 'u-c', isPrivate: false };
const minePrivate = { authorId: 'u-c', isPrivate: true };
const productA = { merchantId: 'm-a' };

describe('누가 답할 수 있는가', () => {
  it('자기 상품이면 답한다', () => {
    expect(canAnswerInquiry(merchantA, productA)).toBe(true);
  });

  it('남의 상품에는 답하지 못한다', () => {
    // 답하면 그 브랜드를 대신 말하는 셈이 된다
    expect(canAnswerInquiry(merchantB, productA)).toBe(false);
  });

  it('운영진은 어느 상품이든 답한다', () => {
    expect(canAnswerInquiry(admin, productA)).toBe(true);
  });

  it('고객은 답하지 못한다', () => {
    expect(canAnswerInquiry(customer, productA)).toBe(false);
  });

  it('권한 표에도 들어 있다', () => {
    expect(permissionsOf('MERCHANT')).toContain('inquiry:answer');
    expect(permissionsOf('CUSTOMER')).not.toContain('inquiry:answer');
  });
});

describe('비공개 문의를 누가 보는가', () => {
  it('공개 문의는 로그인하지 않아도 본다', () => {
    // 같은 것을 궁금해하는 사람이 다시 묻지 않아도 된다
    expect(canReadInquiry(null, mine, productA)).toBe(true);
  });

  it('비공개는 로그인하지 않으면 못 본다', () => {
    expect(canReadInquiry(null, minePrivate, productA)).toBe(false);
  });

  it('쓴 사람은 본다', () => {
    expect(canReadInquiry(customer, minePrivate, productA)).toBe(true);
  });

  it('남은 못 본다', () => {
    /*
     * 사이즈를 물으며 체형을, 배송을 물으며 사는 곳을 적는 일이 흔하다.
     * 그게 상품 페이지에 그대로 남으면 안 된다.
     */
    expect(canReadInquiry(other, minePrivate, productA)).toBe(false);
  });

  it('답할 사람은 본다 — 못 보면 답할 수가 없다', () => {
    expect(canReadInquiry(merchantA, minePrivate, productA)).toBe(true);
    expect(canReadInquiry(admin, minePrivate, productA)).toBe(true);
  });

  it('남의 상품 가맹점은 못 본다', () => {
    expect(canReadInquiry(merchantB, minePrivate, productA)).toBe(false);
  });
});

describe('누가 지울 수 있는가', () => {
  it('본인은 지운다', () => {
    expect(canDeleteInquiry(customer, mine)).toBe(true);
  });

  it('남은 못 지운다', () => {
    expect(canDeleteInquiry(other, mine)).toBe(false);
  });

  it('운영진은 내릴 수 있다 — 리뷰와 같은 사람이 판단한다', () => {
    expect(canDeleteInquiry(admin, mine)).toBe(true);
  });

  it('가맹점은 남의 문의를 지우지 못한다', () => {
    // 답할 수는 있어도 지우는 것은 다른 일이다
    expect(canDeleteInquiry(merchantA, mine)).toBe(false);
  });
});

describe('답변 여부', () => {
  it('시각이 있으면 답변된 것이다', () => {
    expect(isAnswered({ answeredAt: new Date() })).toBe(true);
    expect(isAnswered({ answeredAt: null })).toBe(false);
  });

  it('모든 오류 코드에 문구가 있다', () => {
    for (const [code, message] of Object.entries(INQUIRY_ERROR)) {
      expect(message, code).toBeTruthy();
    }
  });
});
