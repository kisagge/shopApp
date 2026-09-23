import { describe, it, expect } from 'vitest';
import { checkOrder } from '@shop/core';
import { ORDER_ERROR, ORDER_ERROR_MESSAGE } from '@shop/contract';

/**
 * 거절 이유와 창구가 내보내는 코드가 같은 말을 한다.
 *
 * **규칙은 core 에, 코드 목록은 계약에 있다.** core 는 계약을 모른다(그 방향으로만 기댄다) —
 * 그래서 둘이 조용히 갈라질 수 있다. core 에 이유를 하나 더하고 계약에 코드를 안 더하면,
 * 주문 창구가 사용자에게 보여 줄 문구가 없는 코드를 내보낸다.
 *
 * 여기서 그 둘을 맞춰 본다. 맞추는 자리가 없으면 어긋남은 배포 뒤에 드러난다.
 */

/** core 가 낼 수 있는 이유를 실제로 한 번씩 만들어 본다 — 손으로 적으면 새 이유를 빠뜨린다 */
const reasons = [
  checkOrder({
    lines: [{ variantId: 'v-1', issue: 'SOLD_OUT', quantity: 0 }],
    pointsUsed: 0, couponDiscount: 0, requestedPoints: undefined,
    hasCouponCode: false, allocationCount: 0,
  }),
  checkOrder({
    lines: [{ variantId: 'v-1', issue: null, quantity: 0 }],
    pointsUsed: 0, couponDiscount: 0, requestedPoints: undefined,
    hasCouponCode: false, allocationCount: 0,
  }),
  checkOrder({
    lines: [{ variantId: 'v-1', issue: null, quantity: 1 }],
    pointsUsed: 100, couponDiscount: 0, requestedPoints: 5000,
    hasCouponCode: false, allocationCount: 1,
  }),
  checkOrder({
    lines: [{ variantId: 'v-1', issue: null, quantity: 1 }],
    pointsUsed: 0, couponDiscount: 0, requestedPoints: undefined,
    hasCouponCode: true, allocationCount: 1,
  }),
].map((r) => r?.reason);

describe('거절 이유', () => {
  it('네 가지를 실제로 만들어 냈다 — 못 만들면 아래가 헛돈다', () => {
    expect(new Set(reasons).size).toBe(4);
    expect(reasons).not.toContain(undefined);
  });

  it('손님에게 나가는 이유는 모두 계약에 있는 코드다', () => {
    const missing = reasons.filter((reason) => !(ORDER_ERROR as readonly string[]).includes(reason!));

    expect(
      missing,
      `계약에 없는 코드로 거절한다: ${missing.join(', ')} — ` +
        '주문 창구가 보여 줄 문구가 없는 코드를 내보낸다.',
    ).toEqual([]);
  });

  it('그 코드마다 사람이 읽는 문구가 있다', () => {
    for (const reason of reasons) {
      expect(ORDER_ERROR_MESSAGE[reason as keyof typeof ORDER_ERROR_MESSAGE], reason).toBeTruthy();
    }
  });

  it('우리 쪽 어긋남은 사용자 코드로 나가지 않는다', () => {
    // INVARIANT 는 사람이 고칠 수 있는 것이 아니다 — 창구가 500 으로 터뜨린다
    const invariant = checkOrder({
      lines: [{ variantId: 'v-1', issue: null, quantity: 1 }],
      pointsUsed: 0, couponDiscount: 3000, requestedPoints: undefined,
      hasCouponCode: false, allocationCount: 1,
    });

    expect(invariant?.reason).toBe('INVARIANT');
    expect((ORDER_ERROR as readonly string[]).includes('INVARIANT')).toBe(false);
  });
});
