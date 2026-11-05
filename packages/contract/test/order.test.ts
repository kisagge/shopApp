import { describe, it, expect } from 'vitest';
import { createOrderRequestSchema } from '../src';

/**
 * 주문 만들기 계약.
 *
 * **배송지가 어디인지는 둘 중 하나로 온다** — 저장해 둔 것을 고르거나(`addressId`),
 * 그 자리에서 새로 적거나(`address`). 둘 다 `optional` 이라 **둘 다 없는 요청이 타입을
 * 통과한다.** 그래서 `.refine()` 이 막는데, 그 콜백이 한 번도 안 돌았다.
 *
 * 막히지 않으면 **갈 곳이 없는 주문**이 만들어진다 — 결제는 끝났고 보낼 데가 없다.
 */

const line = { variantId: 'cmtgrsydv0011x9ohazcdqo6p', quantity: 1 };
const address = {
  recipient: '김손님', phone: '010-0000-0000', postalCode: '06236', address1: '서울 강남구 테헤란로 1',
};
const base = { lines: [line], paymentMethod: 'CARD' as const, agreedToTerms: true as const };

describe('배송지를 어떻게 받는가', () => {
  it('저장해 둔 배송지를 고르면 받는다', () => {
    expect(createOrderRequestSchema.safeParse({ ...base, addressId: line.variantId }).success).toBe(true);
  });

  it('그 자리에서 새로 적으면 받는다', () => {
    expect(createOrderRequestSchema.safeParse({ ...base, address }).success).toBe(true);
  });

  it('둘 다 없으면 받지 않는다 — 갈 곳 없는 주문이 생긴다', () => {
    const r = createOrderRequestSchema.safeParse(base);
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('valid.addressPick');
    expect(r.error?.issues[0]?.path).toEqual(['address']);
  });

  /**
   * **둘 다 보내는 것은 막지 않는다.** 화면에서 저장된 배송지를 고른 뒤 한 칸을 고치면
   * 둘이 함께 올 수 있고, 어느 쪽을 쓸지는 서버가 정한다 — 계약이 거절하면 그 흐름이 막힌다.
   */
  it('둘 다 보내도 받는다', () => {
    expect(createOrderRequestSchema.safeParse({ ...base, addressId: line.variantId, address }).success).toBe(true);
  });

  it('약관 동의 없이는 주문을 만들지 않는다', () => {
    expect(createOrderRequestSchema.safeParse({ ...base, address, agreedToTerms: false }).success).toBe(false);
  });

  it('담은 것이 없으면 받지 않는다', () => {
    const r = createOrderRequestSchema.safeParse({ ...base, lines: [], address });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('valid.noItems');
  });
});
