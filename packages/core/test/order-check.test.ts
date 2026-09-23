import { describe, it, expect } from 'vitest';
import { checkOrder, type OrderCheckInput } from '../src/order-check';

/**
 * 주문을 만들지 않는 이유.
 *
 * **이 목록을 보려면 335줄짜리 함수를 열어야 했다.** 검사 여섯 개가 트랜잭션과 스냅샷
 * 만들기 사이에 흩어져 있었고, 순서에 얽힌 사연도 그 사이에 적혀 있었다.
 */

const line = (over: Partial<OrderCheckInput['lines'][number]> = {}) => ({
  variantId: 'v-1', issue: null, quantity: 1, ...over,
});

const input = (over: Partial<OrderCheckInput> = {}): OrderCheckInput => ({
  lines: [line()],
  pointsUsed: 0,
  couponDiscount: 0,
  requestedPoints: undefined,
  hasCouponCode: false,
  allocationCount: 1,
  ...over,
});

describe('통과', () => {
  it('멀쩡한 견적은 막지 않는다', () => {
    expect(checkOrder(input())).toBeNull();
  });

  it('부탁한 만큼 포인트가 쓰였으면 통과한다', () => {
    expect(checkOrder(input({ requestedPoints: 1000, pointsUsed: 1000 }))).toBeNull();
  });
});

describe('품절', () => {
  it('문제 있는 줄이 하나라도 있으면 만들지 않는다', () => {
    /*
     * 나머지만 조용히 처리하면 사용자가 무엇을 샀는지 모른 채 결제한다.
     */
    const result = checkOrder(input({
      lines: [line(), line({ variantId: 'v-2', issue: 'SOLD_OUT', quantity: 0 })],
      allocationCount: 1,
    }));

    expect(result).toEqual({ reason: 'OUT_OF_STOCK', variantIds: ['v-2'] });
  });

  /**
   * **순서가 중요하다.** 빈 주문 검사를 앞에 두었더니 한 줄짜리 주문이 품절됐을 때
   * "주문할 수 있는 상품이 없습니다" 가 나갔다 — 손님 눈앞에는 상품이 있는데 말이다.
   * 마지막 한 개를 두 사람이 동시에 사는 검사가 그것을 잡았다: 막는 것은 제대로 막고
   * 있었고 **말이 틀렸다.**
   */
  it('한 줄짜리 주문이 품절되면 "빈 주문" 이 아니라 "품절" 이라고 말한다', () => {
    const result = checkOrder(input({
      lines: [line({ issue: 'SOLD_OUT', quantity: 0 })],
      allocationCount: 0,
    }));

    expect(result).toMatchObject({ reason: 'OUT_OF_STOCK', variantIds: ['v-1'] });
  });

  it('어느 옵션이 품절인지 함께 알린다 — 화면이 그 줄을 짚어야 한다', () => {
    const result = checkOrder(input({
      lines: [line({ variantId: 'a', issue: 'SOLD_OUT', quantity: 0 }),
              line({ variantId: 'b', issue: 'INACTIVE', quantity: 0 })],
      allocationCount: 0,
    }));

    expect(result).toMatchObject({ variantIds: ['a', 'b'] });
  });
});

describe('빈 주문', () => {
  it('살 수 있는 줄이 없으면 만들지 않는다', () => {
    expect(checkOrder(input({ lines: [line({ quantity: 0 })], allocationCount: 0 }))).toEqual({
      reason: 'EMPTY_ORDER',
    });
  });

  it('줄이 아예 없어도 같다', () => {
    expect(checkOrder(input({ lines: [], allocationCount: 0 }))).toEqual({ reason: 'EMPTY_ORDER' });
  });
});

describe('포인트와 쿠폰', () => {
  it('부탁한 만큼 못 쓰면 만들지 않는다 — 덜 깎인 금액으로 결제되면 안 된다', () => {
    expect(checkOrder(input({ requestedPoints: 5000, pointsUsed: 3000 }))).toEqual({
      reason: 'INSUFFICIENT_POINTS',
    });
  });

  it('쿠폰 코드를 보냈는데 하나도 안 깎였으면 만들지 않는다', () => {
    expect(checkOrder(input({ hasCouponCode: true, couponDiscount: 0 }))).toEqual({
      reason: 'COUPON_INVALID',
    });
  });

  /**
   * **코드 없이 온 주문에 쿠폰 할인이 붙으면 그건 우리 쪽 어긋남이다.**
   *
   * 쿠폰을 쓴 것으로 처리하는 일은 보낸 코드로만 한다. 그러니 코드 없는 주문의 할인은
   * 누구의 쿠폰도 소진하지 않은 할인이다 — 한동안 실제로 그랬다. 사람이 고칠 수 있는
   * 오류가 아니므로 사용자 메시지로 바꾸지 않는다.
   */
  it('코드 없는 주문에 할인이 붙으면 어긋남으로 말한다', () => {
    const result = checkOrder(input({ hasCouponCode: false, couponDiscount: 3000 }));

    expect(result).toMatchObject({ reason: 'INVARIANT' });
    expect((result as { detail: string }).detail).toContain('3000');
  });
});

describe('줄 몫', () => {
  it('몫의 수가 살 수 있는 줄과 다르면 어긋남이다 — 쿠폰 몫이 엉뚱한 줄에 박힌다', () => {
    const result = checkOrder(input({
      lines: [line({ variantId: 'a' }), line({ variantId: 'b' })],
      allocationCount: 1,
    }));

    expect(result).toMatchObject({ reason: 'INVARIANT' });
  });

  it('수량 0 인 줄은 몫에서 빠진다 — 그 줄까지 세면 늘 어긋난 것이 된다', () => {
    /*
     * 품절 줄은 위에서 이미 걸리므로 여기 오는 수량 0 은 issue 없이 0 인 줄뿐이다.
     */
    const result = checkOrder(input({
      lines: [line({ variantId: 'a' }), line({ variantId: 'b', quantity: 0 })],
      allocationCount: 1,
    }));

    expect(result).toBeNull();
  });
});
