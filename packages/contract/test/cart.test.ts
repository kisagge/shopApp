import { describe, it, expect } from 'vitest';
import {
  cartQuoteRequestSchema, cartLineInputSchema, wonSchema,
  reorderRequestSchema, reorderResponseSchema,
} from '../src';
import { MAX_CART_LINES, MAX_QUANTITY, REORDER_SKIP } from '@shop/core';

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

  /**
   * **상한을 숫자로 적은 검사는 상한을 낮춰도 통과한다.** 실제로 계약은 수량을 두 군데서 받는데
   * 한쪽만 core 의 상수를 보고 있었다(`cart-sync.ts` 는 `MAX_QUANTITY`, `common.ts` 는 99 를 손으로).
   * 두 창구가 다른 수를 들 수 있는 상태였고, 그 어긋남을 이 검사가 못 잡았다.
   */
  it.each([MAX_QUANTITY - 1, MAX_QUANTITY])('%i 개는 받는다', (quantity) => {
    expect(cartLineInputSchema.safeParse({ variantId: 'cmtgrsydv0011x9ohazcdqo6p', quantity }).success)
      .toBe(true);
  });

  it('상한보다 하나 많으면 거절한다', () => {
    const r = cartLineInputSchema.safeParse({
      variantId: 'cmtgrsydv0011x9ohazcdqo6p', quantity: MAX_QUANTITY + 1,
    });

    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('valid.quantityMax');
  });

  it.each([0, -1, 1.5])('%s 는 거절한다', (quantity) => {
    expect(cartLineInputSchema.safeParse({ variantId: 'cmtgrsydv0011x9ohazcdqo6p', quantity }).success)
      .toBe(false);
  });
});

describe('cartQuoteRequestSchema', () => {
  const line = { variantId: 'cmtgrsydv0011x9ohazcdqo6p', quantity: 1 };

  it('isRemoteArea 는 생략하면 false 로 채운다', () => {
    expect(cartQuoteRequestSchema.parse({ lines: [line] }).isRemoteArea).toBe(false);
  });

  it('빈 배열은 사전 열쇠로 거부한다 — 문구는 응답을 만들 때 붙는다', () => {
    const r = cartQuoteRequestSchema.safeParse({ lines: [] });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('valid.noItems');
  });

  /**
   * **담을 수 없는 장바구니의 견적을 내 주고 있었다.** 여기는 100 줄을 받았는데 저장하는 창구는
   * 50 줄에서 막는다 — 두 배를 받아 셈을 해 주고 저장은 거절하는 셈이다. 그 차이를 짚는 검사가
   * 없었고, 101 이라는 숫자가 그 사실을 가리고 있었다.
   */
  it('장바구니가 담을 수 있는 줄 수까지 받는다', () => {
    const many = Array.from({ length: MAX_CART_LINES }, () => line);

    expect(cartQuoteRequestSchema.safeParse({ lines: many }).success).toBe(true);
  });

  it('그보다 하나 많으면 사전 열쇠로 거절한다', () => {
    const many = Array.from({ length: MAX_CART_LINES + 1 }, () => line);
    const r = cartQuoteRequestSchema.safeParse({ lines: many });

    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('valid.tooManyItems');
  });

  it('견적이 받는 줄 수와 장바구니가 담는 줄 수가 같다', () => {
    const atLimit = Array.from({ length: MAX_CART_LINES }, () => line);
    const overLimit = [...atLimit, line];

    expect(cartQuoteRequestSchema.safeParse({ lines: atLimit }).success).toBe(true);
    expect(cartQuoteRequestSchema.safeParse({ lines: overLimit }).success).toBe(false);
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

/**
 * **다시 담기 요청과 응답.**
 *
 * 요청에는 지금 담긴 옵션 id 만 싣는다 — 무엇을 몇 개 담을지는 주문이 정한다(요청이 정하면 남의
 * 옵션을 끼워 넣을 수 있다). 그 id 목록도 장바구니가 담을 수 있는 줄 수와 **같은 상한**이어야
 * 한다: 더 보내 봐야 서버는 그만큼만 센다.
 *
 * 응답의 "담지 못한 까닭" 은 core 가 아는 넷뿐이다. 까닭을 하나 더하면서 계약을 안 고치면
 * **창구가 자기 응답을 거절한다.**
 */
describe('다시 담기', () => {
  const id = 'cmtgrsydv0011x9ohazcdqo6p';

  it('담긴 옵션이 없어도 된다 — 빈 장바구니에서도 다시 담는다', () => {
    expect(reorderRequestSchema.parse({}).cartVariantIds).toEqual([]);
  });

  it('장바구니 줄 수 상한까지 받는다', () => {
    const ids = Array.from({ length: MAX_CART_LINES }, () => id);

    expect(reorderRequestSchema.safeParse({ cartVariantIds: ids }).success).toBe(true);
  });

  it('그보다 하나 많으면 거절한다', () => {
    const ids = Array.from({ length: MAX_CART_LINES + 1 }, () => id);

    expect(reorderRequestSchema.safeParse({ cartVariantIds: ids }).success).toBe(false);
  });

  const response = (reason: string) => ({
    add: [],
    skipped: [{ productName: '울 코트', optionLabel: '오트 / M', reason }],
  });

  it.each([...REORDER_SKIP])('%s 를 응답에 실을 수 있다', (reason) => {
    expect(reorderResponseSchema.safeParse(response(reason)).success, reason).toBe(true);
  });

  /** core 에 까닭을 더하면서 계약을 안 고치면 창구가 자기 응답을 거절한다 */
  it('모르는 까닭은 거절한다', () => {
    expect(reorderResponseSchema.safeParse(response('MYSTERY')).success).toBe(false);
  });
});
