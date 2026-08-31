import { describe, it, expect } from 'vitest';
import { cartQuoteRequestSchema, couponInputSchema, wonSchema } from '../src';

describe('wonSchema', () => {
  it.each([
    ['소수점', 1000.5],
    ['음수', -1],
    ['NaN', Number.NaN],
    ['문자열', '1000'],
  ])('%s 를 거부한다', (_label, value) => {
    expect(wonSchema.safeParse(value).success).toBe(false);
  });

  it('0원은 허용한다 — 무료배송·전액할인이 가능하다', () => {
    expect(wonSchema.safeParse(0).success).toBe(true);
  });
});

describe('cartQuoteRequestSchema', () => {
  const line = {
    variantId: 'v-1', productName: '코트', listPrice: 413_000, discountPercent: 30, quantity: 1,
  };

  it('isRemoteArea 는 생략하면 false 로 채운다', () => {
    const parsed = cartQuoteRequestSchema.parse({ lines: [line] });
    expect(parsed.isRemoteArea).toBe(false);
  });

  it('빈 배열은 사람이 읽을 수 있는 메시지로 거부한다', () => {
    const r = cartQuoteRequestSchema.safeParse({ lines: [] });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('주문할 상품이 없습니다');
  });

  it('한 번에 담을 수 있는 줄 수를 제한한다', () => {
    const many = Array.from({ length: 101 }, (_, i) => ({ ...line, variantId: `v-${i}` }));
    expect(cartQuoteRequestSchema.safeParse({ lines: many }).success).toBe(false);
  });

  it('에러 경로로 어느 줄의 어느 필드가 틀렸는지 알 수 있다', () => {
    const r = cartQuoteRequestSchema.safeParse({ lines: [line, { ...line, quantity: 0 }] });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['lines', 1, 'quantity']);
  });
});

describe('couponInputSchema', () => {
  it('정액 쿠폰을 파싱한다', () => {
    const r = couponInputSchema.safeParse({
      kind: 'amount', code: 'WELCOME', value: 10_000, minimumOrder: 30_000,
    });
    expect(r.success).toBe(true);
  });

  it('정률 쿠폰의 maxDiscount 는 null 을 허용한다 — 상한 없는 쿠폰', () => {
    const r = couponInputSchema.safeParse({
      kind: 'percent', code: 'A', percent: 20, maxDiscount: null, minimumOrder: 0,
    });
    expect(r.success).toBe(true);
  });

  it('알 수 없는 kind 는 거부한다', () => {
    expect(couponInputSchema.safeParse({ kind: 'bogo', code: 'X' }).success).toBe(false);
  });

  it('정액 쿠폰에 percent 를 섞어 보내도 kind 에 맞는 필드만 본다', () => {
    const r = couponInputSchema.safeParse({
      kind: 'amount', code: 'A', value: 5_000, minimumOrder: 0, percent: 50,
    });
    expect(r.success).toBe(true);
  });
});
