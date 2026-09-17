import { describe, it, expect } from 'vitest';
import {
  bestCoupon, couponBlocker, couponChoice, couponOffers, discountFor, calculateCart, won,
  type CartLine, type Coupon,
} from '../src';

/**
 * 어느 쿠폰이 이 장바구니에 가장 유리한가.
 *
 * 사람에게 코드를 하나씩 넣어 보게 하지 않는다 — 정률은 상한이, 정액은 최소
 * 주문 금액이, 어떤 것은 대상 상품이 걸려서 눈으로는 알 수 없다.
 */

const line = (over: Partial<CartLine> & { variantId: string }): CartLine => ({
  productId: `p-${over.variantId}`,
  productName: '코트',
  brandId: 'b-noon',
  categoryId: 'c-outer',
  listPrice: won(100_000),
  salePrice: won(100_000),
  quantity: 1,
  ...over,
});

const cart = [line({ variantId: 'v1' }), line({ variantId: 'v2' })]; // 20만원

const amount = (code: string, value: number, minimumOrder = 0): Coupon => ({
  kind: 'amount', code, value: won(value), minimumOrder: won(minimumOrder),
});
const percent = (code: string, p: number, maxDiscount: number | null = null): Coupon => ({
  kind: 'percent', code, percent: p, maxDiscount: maxDiscount === null ? null : won(maxDiscount),
  minimumOrder: won(0),
});

const at = (iso: string) => new Date(iso);
const cand = (coupon: Coupon, expiresAt = '2026-12-31T00:00:00Z') => ({
  coupon, expiresAt: at(expiresAt), ref: coupon.code,
});

describe('쿠폰 하나가 깎는 금액', () => {
  /** 견적이 말하는 금액과 다르면 사람은 어느 쪽을 믿어야 할지 알 수 없다 */
  it('견적과 같은 숫자를 말한다', () => {
    const coupon = percent('P10', 10);

    expect(discountFor(coupon, cart)).toBe(calculateCart({ lines: cart, coupon }).couponDiscount);
  });

  it('최소 주문 금액에 못 미치면 0 이다', () => {
    expect(discountFor(amount('BIG', 10_000, 300_000), cart)).toBe(0);
  });

  it('정률 상한이 걸리면 상한까지만', () => {
    // 20만원의 50% = 10만원이지만 상한 5,000원
    expect(discountFor(percent('CAP', 50, 5_000), cart)).toBe(5_000);
  });
});

describe('가장 많이 깎이는 것 고르기', () => {
  it('금액이 큰 쪽을 고른다', () => {
    const pick = bestCoupon([cand(amount('A', 5_000)), cand(percent('B', 10))], cart);

    expect(pick?.ref).toBe('B'); // 20만원의 10% = 2만원
    expect(pick?.discount).toBe(20_000);
  });

  /** 정률이 늘 유리한 것이 아니다 — 상한이 걸리면 정액이 이긴다 */
  it('상한 걸린 정률보다 정액이 나을 수 있다', () => {
    const pick = bestCoupon([cand(amount('A', 9_000)), cand(percent('B', 50, 5_000))], cart);

    expect(pick?.ref).toBe('A');
  });

  it('하나도 못 쓰면 null 이다 — 억지로 붙이지 않는다', () => {
    expect(bestCoupon([cand(amount('BIG', 10_000, 999_999))], cart)).toBeNull();
  });

  it('후보가 없으면 null 이다', () => {
    expect(bestCoupon([], cart)).toBeNull();
  });

  /**
   * 어느 것을 써도 오늘 내는 돈이 같다면, 오래 남는 쪽을 아껴 둔다.
   */
  it('같은 금액이면 먼저 만료되는 것을 쓴다', () => {
    const pick = bestCoupon(
      [
        cand(amount('LATE', 5_000), '2026-12-31T00:00:00Z'),
        cand(amount('SOON', 5_000), '2026-09-30T00:00:00Z'),
      ],
      cart,
    );

    expect(pick?.ref).toBe('SOON');
  });

  /** 새로고침할 때마다 다른 쿠폰이 붙으면 사람은 자기가 무엇을 눌렀는지 모른다 */
  it('만료일까지 같으면 늘 같은 답을 낸다', () => {
    const two = [cand(amount('ZULU', 5_000)), cand(amount('ALPHA', 5_000))];

    expect(bestCoupon(two, cart)?.ref).toBe('ALPHA');
    expect(bestCoupon([...two].reverse(), cart)?.ref).toBe('ALPHA');
  });

  it('대상이 정해진 쿠폰은 그 줄에만 붙는다', () => {
    const onlyV1: Coupon = {
      kind: 'amount', code: 'ONLY', value: won(50_000), minimumOrder: won(0),
      scope: { productIds: ['p-v1'] },
    };

    // 대상 줄 10만원이 상한이라 5만원은 다 깎이지만, 장바구니 전체 기준이 아니다
    expect(discountFor(onlyV1, cart)).toBe(50_000);
    expect(discountFor(onlyV1, [line({ variantId: 'v2' })])).toBe(0);
  });
});

describe('쿠폰마다 얼마가 깎이는지', () => {
  /**
   * 못 쓰는 것을 목록에서 빼면 "내 쿠폰이 어디 갔지" 가 되고, 조금 더 담으면
   * 쓸 수 있다는 사실도 함께 사라진다.
   */
  it('못 쓰는 쿠폰도 0 으로 함께 돌려준다', () => {
    const offers = couponOffers(
      [cand(amount('OK', 5_000)), cand(amount('NO', 10_000, 999_999))],
      cart,
    );

    expect(offers).toHaveLength(2);
    expect(offers.find((o) => o.ref === 'NO')?.discount).toBe(0);
  });

  it('가장 나은 것과 같은 금액을 말한다 — 두 곳이 다른 수를 말하면 안 된다', () => {
    const cands = [cand(amount('A', 5_000)), cand(percent('B', 10))];
    const best = bestCoupon(cands, cart)!;
    const offers = couponOffers(cands, cart);

    expect(offers.find((o) => o.ref === best.ref)?.discount).toBe(best.discount);
    expect(Math.max(...offers.map((o) => o.discount))).toBe(best.discount);
  });
});

describe('쿠폰을 어떻게 붙일지', () => {
  it('쓰지 않기를 골랐으면 붙이지 않는다 — 코드를 함께 보냈어도', () => {
    expect(couponChoice({ useCoupon: false, hasCode: false })).toBe('NONE');
    expect(couponChoice({ useCoupon: false, hasCode: true })).toBe('NONE');
  });

  it('코드를 보냈으면 그 코드', () => {
    expect(couponChoice({ useCoupon: true, hasCode: true })).toBe('ASKED');
    expect(couponChoice({ useCoupon: undefined, hasCode: true })).toBe('ASKED');
  });

  it('골라 달라고 부탁했을 때만 서버가 고른다', () => {
    expect(couponChoice({ useCoupon: true, hasCode: false })).toBe('AUTO');
  });

  it('아무 말이 없으면 고르지 않는다 — 주문 생성이 그렇게 부르고, 고른 쿠폰을 소진하지 않는다', () => {
    /*
     * 예전에는 여기서 골랐다. 주문 생성은 보낸 코드로만 쿠폰을 소진하므로, 견적이 골라 준 할인은
     * 누구의 쿠폰도 쓰지 않은 할인이 됐다 — "쓰지 않기" 를 고른 손님도 받았고, 끝없이 반복됐다.
     */
    expect(couponChoice({ useCoupon: undefined, hasCode: false })).toBe('NONE');
  });
});

/**
 * **왜 못 쓰는지 말한다.** "사용 불가" 한 마디로는 대상 상품이 없어서인지 조금 모자라서인지 알 수 없었다.
 * 모자라면 얼마를 더 담으면 되는지까지 — 할인을 셈하는 것과 같은 판정으로 센다.
 */
describe('못 쓰는 까닭', () => {
  it('쓸 수 있으면 까닭이 없다', () => {
    expect(couponBlocker(amount('OK', 5_000), cart)).toBeNull();
  });

  it('최소 주문 금액에 모자라면 얼마가 모자란지 말한다', () => {
    // 20만원 담았고 25만원부터 — 5만원 더
    expect(couponBlocker(amount('MIN', 10_000, 250_000), cart)).toEqual({
      reason: 'BELOW_MINIMUM', minimum: 250_000, shortfall: 50_000,
    });
  });

  it('모자란 금액은 대상 상품의 합계로 센다 — 전체 합계로 세면 더 담아도 못 쓴다', () => {
    const noonOnly: Coupon = {
      kind: 'amount', code: 'NOON', value: won(10_000), minimumOrder: won(150_000),
      scope: { brandIds: ['b-noon'] },
    };
    // 대상 10만원 + 대상 아닌 10만원 → 대상만 세면 5만원 모자란다(전체로 세면 모자라지 않다)
    const mixed = [line({ variantId: 'v1' }), line({ variantId: 'v2', brandId: 'b-other' })];
    expect(couponBlocker(noonOnly, mixed)).toEqual({ reason: 'BELOW_MINIMUM', minimum: 150_000, shortfall: 50_000 });
    // 말한 만큼 대상 상품을 더 담으면 실제로 깎인다
    expect(discountFor(noonOnly, [...mixed, line({ variantId: 'v3', salePrice: won(50_000), listPrice: won(50_000) })]))
      .toBeGreaterThan(0);
  });

  it('담은 상품 중 걸리는 것이 없으면 그렇게 말한다', () => {
    const onlyV1: Coupon = {
      kind: 'amount', code: 'ONLY', value: won(5_000), minimumOrder: won(0),
      scope: { productIds: ['p-v1'] },
    };
    expect(couponBlocker(onlyV1, [line({ variantId: 'v2' })])).toEqual({ reason: 'NO_ELIGIBLE_ITEMS' });
  });

  it('걸리는 것도 없고 금액도 모자라면 걸리는 것이 없다는 쪽을 말한다 — 더 담아도 소용없다', () => {
    const onlyV1: Coupon = {
      kind: 'amount', code: 'ONLY', value: won(5_000), minimumOrder: won(999_999),
      scope: { productIds: ['p-v1'] },
    };
    expect(couponBlocker(onlyV1, [line({ variantId: 'v2' })])).toEqual({ reason: 'NO_ELIGIBLE_ITEMS' });
  });

  it('조건은 맞는데 깎일 것이 0 원이면 그렇게 말한다', () => {
    // 1% 가 1원 아래로 떨어진다
    const tiny = [line({ variantId: 'v1', listPrice: won(50), salePrice: won(50) })];
    expect(couponBlocker(percent('P1', 1), tiny)).toEqual({ reason: 'NO_DISCOUNT' });
  });

  it('쿠폰마다 까닭을 함께 싣는다', () => {
    const offers = couponOffers([cand(amount('OK', 5_000)), cand(amount('NO', 10_000, 250_000))], cart);
    expect(offers.find((o) => o.ref === 'OK')?.blocker).toBeNull();
    expect(offers.find((o) => o.ref === 'NO')?.blocker).toMatchObject({ reason: 'BELOW_MINIMUM', shortfall: 50_000 });
  });
});
