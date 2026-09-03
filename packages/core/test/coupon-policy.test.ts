import { describe, it, expect } from 'vitest';
import {
  normalizeCouponCode, isCouponCodeLike, generateCouponCode,
  validateCouponDefinition, couponStatus, isIssuable, canEditDiscount,
  type CouponDefinition,
} from '../src/coupon-policy';

const base: CouponDefinition = {
  kind: 'AMOUNT', value: 5000, percent: 0, maxDiscount: null,
  minimumOrder: 30_000, issueLimit: 100,
  startsAt: new Date('2026-09-01T00:00:00+09:00'),
  endsAt: new Date('2026-09-30T23:59:59+09:00'),
};

describe('코드 정리', () => {
  it('사람이 옮겨 적은 모양을 하나로 맞춘다', () => {
    expect(normalizeCouponCode('welcome-10')).toBe('WELCOME10');
    expect(normalizeCouponCode(' welcome 10 ')).toBe('WELCOME10');
  });

  it('형식만 본다', () => {
    expect(isCouponCodeLike('welcome10')).toBe(true);
    expect(isCouponCodeLike('ABC')).toBe(false); // 너무 짧다
    expect(isCouponCodeLike('가나다라')).toBe(false);
  });

  it('만든 코드에는 헷갈리는 글자가 없다 — 전단지에서 옮겨 적는 값이다', () => {
    let all = '';
    for (let i = 0; i < 200; i += 1) all += generateCouponCode(8);
    for (const ch of ['O', '0', 'I', '1', 'L']) expect(all).not.toContain(ch);
  });

  it('만든 코드는 형식을 통과한다', () => {
    expect(isCouponCodeLike(generateCouponCode())).toBe(true);
  });
});

describe('발행 내용 검증', () => {
  it('멀쩡한 정액 쿠폰은 통과한다', () => {
    expect(validateCouponDefinition(base)).toEqual({});
  });

  it('할인 금액이 최소 주문 금액보다 크면 막는다 — 그 순간 전 상품이 공짜다', () => {
    const errors = validateCouponDefinition({ ...base, value: 50_000, minimumOrder: 30_000 });
    expect(errors['value']).toContain('최소 주문 금액');
  });

  it('정액에 상한을 두면 무슨 뜻인지 알 수 없다', () => {
    expect(validateCouponDefinition({ ...base, maxDiscount: 3000 })['maxDiscount']).toBeTruthy();
  });

  it('할인율은 1~100% 사이다', () => {
    const percent = { ...base, kind: 'PERCENT' as const, value: 0, maxDiscount: 10_000 };
    expect(validateCouponDefinition({ ...percent, percent: 0 })['percent']).toBeTruthy();
    expect(validateCouponDefinition({ ...percent, percent: 101 })['percent']).toBeTruthy();
    expect(validateCouponDefinition({ ...percent, percent: 30 })).toEqual({});
  });

  it('종료일이 시작일보다 앞서면 막는다', () => {
    const errors = validateCouponDefinition({ ...base, endsAt: new Date('2026-08-01T00:00:00+09:00') });
    expect(errors['endsAt']).toBeTruthy();
  });

  it('발급 수량은 1 이상이거나 무제한이다', () => {
    expect(validateCouponDefinition({ ...base, issueLimit: 0 })['issueLimit']).toBeTruthy();
    expect(validateCouponDefinition({ ...base, issueLimit: null })).toEqual({});
  });
});

describe('상태', () => {
  const c = {
    isActive: true, issueLimit: 100, issuedCount: 0,
    startsAt: new Date('2026-09-01T00:00:00+09:00'),
    endsAt: new Date('2026-09-30T23:59:59+09:00'),
  };
  const during = new Date('2026-09-15T00:00:00+09:00');

  it('기간 안이고 수량이 남으면 발급 중', () => {
    expect(couponStatus(c, during)).toBe('ACTIVE');
    expect(isIssuable(c, during)).toBe(true);
  });

  it('시작 전 · 기간 종료를 구분한다', () => {
    expect(couponStatus(c, new Date('2026-08-01T00:00:00+09:00'))).toBe('SCHEDULED');
    expect(couponStatus(c, new Date('2026-10-01T00:00:00+09:00'))).toBe('EXPIRED');
  });

  it('수량이 다 나가면 소진', () => {
    expect(couponStatus({ ...c, issuedCount: 100 }, during)).toBe('EXHAUSTED');
  });

  it('무제한이면 소진되지 않는다', () => {
    expect(couponStatus({ ...c, issueLimit: null, issuedCount: 99999 }, during)).toBe('ACTIVE');
  });

  it('중지가 가장 세다 — 손으로 내린 것을 기간이 되살리면 안 된다', () => {
    expect(couponStatus({ ...c, isActive: false }, during)).toBe('INACTIVE');
    expect(isIssuable({ ...c, isActive: false }, during)).toBe(false);
  });
});

describe('할인 내용 수정', () => {
  it('한 장도 안 나갔으면 고칠 수 있다', () => {
    expect(canEditDiscount(0)).toBe(true);
  });

  it('한 장이라도 나갔으면 못 고친다 — 받은 사람은 그 조건을 믿고 있다', () => {
    expect(canEditDiscount(1)).toBe(false);
  });
});
