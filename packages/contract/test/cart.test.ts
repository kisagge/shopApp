import { describe, it, expect } from 'vitest';
import {
  cartQuoteRequestSchema, cartLineInputSchema, wonSchema,
} from '../src';

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

describe('cartLineInputSchema — 요청에 금액이 없다', () => {
  it('변형 id 와 수량만 받는다', () => {
    const r = cartLineInputSchema.safeParse({ variantId: 'cmtgrsydv0011x9ohazcdqo6p', quantity: 2 });
    expect(r.success).toBe(true);
    expect(r.success && Object.keys(r.data).toSorted()).toEqual(['quantity', 'variantId']);
  });

  it('가격을 실어 보내도 결과에 담기지 않는다 — 서버가 DB 에서 조회한다', () => {
    const r = cartLineInputSchema.safeParse({
      variantId: 'cmtgrsydv0011x9ohazcdqo6p', quantity: 1, listPrice: 1, salePrice: 1, unitPrice: 1,
    });
    expect(r.success).toBe(true);
    expect(r.success && r.data).toEqual({ variantId: 'cmtgrsydv0011x9ohazcdqo6p', quantity: 1 });
  });

  it('수량 0 은 거부한다', () => {
    expect(cartLineInputSchema.safeParse({ variantId: 'cmtgrsydv0011x9ohazcdqo6p', quantity: 0 }).success).toBe(false);
  });

  it('한 번에 담을 수 있는 수량 상한이 있다', () => {
    expect(cartLineInputSchema.safeParse({ variantId: 'cmtgrsydv0011x9ohazcdqo6p', quantity: 100 }).success).toBe(false);
  });
});

describe('cartQuoteRequestSchema', () => {
  const line = { variantId: 'cmtgrsydv0011x9ohazcdqo6p', quantity: 1 };

  it('isRemoteArea 는 생략하면 false 로 채운다', () => {
    expect(cartQuoteRequestSchema.parse({ lines: [line] }).isRemoteArea).toBe(false);
  });

  it('빈 배열은 사람이 읽을 수 있는 메시지로 거부한다', () => {
    const r = cartQuoteRequestSchema.safeParse({ lines: [] });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('주문할 상품이 없습니다');
  });

  it('줄 수를 제한한다', () => {
    const many = Array.from({ length: 101 }, () => line);
    expect(cartQuoteRequestSchema.safeParse({ lines: many }).success).toBe(false);
  });

  it('에러 경로로 어느 줄의 어느 필드가 틀렸는지 알 수 있다', () => {
    const r = cartQuoteRequestSchema.safeParse({ lines: [line, { ...line, quantity: 0 }] });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['lines', 1, 'quantity']);
  });

  it('쿠폰은 코드만 받는다 — 할인 조건은 서버가 안다', () => {
    const r = cartQuoteRequestSchema.safeParse({ lines: [line], couponCode: '  WELCOME10000  ' });
    expect(r.success).toBe(true);
    expect(r.success && r.data.couponCode).toBe('WELCOME10000');
  });

  it('쿠폰 코드 길이를 제한한다', () => {
    const r = cartQuoteRequestSchema.safeParse({ lines: [line], couponCode: 'x'.repeat(100) });
    expect(r.success).toBe(false);
  });
});
