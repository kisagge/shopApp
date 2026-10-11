import { describe, it, expect } from 'vitest';
import { won, MoneyError } from '../src/money';
import { calculateCart, MIN_POINTS_USE, type CartLine, type Coupon } from '../src/cart';
import { couponBlocker, discountFor } from '../src/coupon-pick';
import { DEFAULT_SHIPPING } from '../src/shipping';

const coat: CartLine = {
  variantId: 'v-coat-m', productName: '오버사이즈 울 블렌드 코트',
  listPrice: won(413_000), salePrice: won(289_000), quantity: 1,
};
const knit: CartLine = {
  variantId: 'v-knit-l', productName: '램스울 크루넥 니트',
  listPrice: won(129_000), salePrice: won(129_000), quantity: 1,
};

describe('calculateCart — 시안의 장바구니 화면과 같은 금액이 나와야 한다', () => {
  const totals = calculateCart({ lines: [coat, knit] });

  it('정가 합계 542,000', () => expect(totals.listTotal).toBe(542_000));
  it('상품 할인 124,000', () => expect(totals.productDiscount).toBe(124_000));
  it('할인 후 418,000', () => expect(totals.merchandiseTotal).toBe(418_000));
  it('5만원 넘으니 무료배송', () => expect(totals.shipping.fee).toBe(0));
  it('결제 예정 418,000', () => expect(totals.payable).toBe(418_000));
  it('적립 1% = 4,180P', () => expect(totals.rewardPoints).toBe(4_180));
});

describe('빈 장바구니', () => {
  it('모든 금액이 0이고 배송비도 붙지 않는다', () => {
    const t = calculateCart({ lines: [] });
    expect(t.payable).toBe(0);
    expect(t.shipping.fee).toBe(0);
    expect(t.rewardPoints).toBe(0);
  });
});

describe('쿠폰', () => {
  const amountCoupon: Coupon = { kind: 'amount', code: 'WELCOME', value: won(10_000), minimumOrder: won(30_000) };

  it('정액 쿠폰이 할인 후 금액에서 차감된다', () => {
    const t = calculateCart({ lines: [coat, knit], coupon: amountCoupon });
    expect(t.couponDiscount).toBe(10_000);
    expect(t.payable).toBe(408_000);
  });

  it('최소 주문금액에 못 미치면 적용되지 않는다', () => {
    const t = calculateCart({
      lines: [{ ...knit, listPrice: won(20_000), salePrice: won(20_000) }],
      coupon: amountCoupon,
    });
    expect(t.couponDiscount).toBe(0);
  });

  it('정률 쿠폰은 최대 할인액에서 잘린다', () => {
    const t = calculateCart({
      lines: [coat, knit],
      coupon: { kind: 'percent', code: 'AUTUMN', percent: 20, maxDiscount: won(30_000), minimumOrder: won(0) },
    });
    // 418,000의 20% = 83,600 이지만 3만원에서 잘림
    expect(t.couponDiscount).toBe(30_000);
  });

  it('쿠폰이 주문 금액보다 커도 결제 금액이 음수가 되지 않는다', () => {
    const t = calculateCart({
      lines: [{ ...knit, listPrice: won(5_000), salePrice: won(5_000) }],
      coupon: { kind: 'amount', code: 'BIG', value: won(50_000), minimumOrder: won(0) },
    });
    expect(t.couponDiscount).toBe(5_000);
    // 5천원짜리 한 건이라 무료배송 임계값 미달 → 배송비 3천원만 남는다
    expect(t.payable).toBe(3_000);
  });
});

describe('포인트', () => {
  it('최소 사용 단위 미만이면 무시한다', () => {
    const t = calculateCart({
      lines: [coat], pointsToUse: won(MIN_POINTS_USE - 1), pointsAvailable: won(10_000),
    });
    expect(t.pointsUsed).toBe(0);
  });

  it('보유 포인트를 넘겨 쓸 수 없다', () => {
    const t = calculateCart({
      lines: [coat], pointsToUse: won(10_000), pointsAvailable: won(3_240),
    });
    expect(t.pointsUsed).toBe(3_240);
  });

  it('포인트로 결제한 몫은 적립 대상에서 빠진다', () => {
    const withPoints = calculateCart({
      lines: [coat, knit], pointsToUse: won(3_000), pointsAvailable: won(3_000),
    });
    const without = calculateCart({ lines: [coat, knit] });
    expect(withPoints.rewardPoints).toBeLessThan(without.rewardPoints);
    expect(withPoints.rewardPoints).toBe(4_150); // (418,000 - 3,000)의 1%
  });
});

describe('할인 적용 순서', () => {
  it('무료배송 판정은 쿠폰·포인트 차감 전 금액으로 한다', () => {
    // 상품 55,000 → 무료배송. 쿠폰 1만원을 써도 배송비가 되살아나면 안 된다.
    const t = calculateCart({
      lines: [{ ...knit, listPrice: won(55_000), salePrice: won(55_000) }],
      coupon: { kind: 'amount', code: 'X', value: won(10_000), minimumOrder: won(0) },
    });
    expect(t.merchandiseTotal).toBe(55_000);
    expect(t.shipping.isFree).toBe(true);
    expect(t.shipping.fee).toBe(0);
    expect(t.payable).toBe(45_000);
  });

  it('쿠폰이 먼저, 포인트가 나중에 적용된다', () => {
    const t = calculateCart({
      lines: [coat, knit],
      coupon: { kind: 'amount', code: 'W', value: won(10_000), minimumOrder: won(0) },
      pointsToUse: won(3_000), pointsAvailable: won(3_240),
    });
    expect(t.couponDiscount).toBe(10_000);
    expect(t.pointsUsed).toBe(3_000);
    // 시안의 체크아웃 화면과 같은 값이다
    expect(t.payable).toBe(405_000);
  });
});

describe('수량', () => {
  it('여러 개면 정가·할인이 함께 곱해진다', () => {
    const t = calculateCart({ lines: [{ ...coat, quantity: 3 }] });
    expect(t.listTotal).toBe(1_239_000);
    expect(t.productDiscount).toBe(372_000);
  });

  it('0개는 거부한다', () => {
    expect(() => calculateCart({ lines: [{ ...coat, quantity: 0 }] })).toThrow(MoneyError);
  });

  it('판매가가 정가보다 크면 거부한다 — 입력 실수를 계산 전에 잡는다', () => {
    expect(() =>
      calculateCart({ lines: [{ ...coat, salePrice: won(500_000) }] }),
    ).toThrow(MoneyError);
  });
});

describe('대상이 정해진 쿠폰', () => {
  const tee = { variantId: 'v-tee', productName: '티셔츠', listPrice: won(20_000), salePrice: won(20_000), quantity: 1, productId: 'p-tee', brandId: 'b-a' };
  const coat = { variantId: 'v-coat', productName: '코트', listPrice: won(200_000), salePrice: won(200_000), quantity: 1, productId: 'p-coat', brandId: 'b-b' };

  it('대상 상품 줄에만 붙는다 — 전체를 깎으면 안 된다', () => {
    const r = calculateCart({
      lines: [tee, coat],
      coupon: {
        kind: 'percent', code: 'TEE50', percent: 50,
        maxDiscount: null, minimumOrder: won(0),
        scope: { productIds: ['p-tee'] },
      },
    });
    // 티셔츠 20,000 의 50% 만. 코트까지 세면 110,000 이 된다.
    expect(r.couponDiscount).toBe(10_000);
  });

  it('최소 주문 금액도 대상 줄 합계로 잰다 — 다른 상품으로 채울 수 없다', () => {
    const r = calculateCart({
      lines: [tee, coat],
      coupon: {
        kind: 'amount', code: 'TEE5000', value: won(5000),
        minimumOrder: won(50_000),
        scope: { productIds: ['p-tee'] },
      },
    });
    // 장바구니는 220,000 이지만 대상은 20,000 뿐이라 기준을 못 넘는다
    expect(r.couponDiscount).toBe(0);
  });

  it('대상이 장바구니에 없으면 할인이 없다', () => {
    const r = calculateCart({
      lines: [coat],
      coupon: {
        kind: 'amount', code: 'TEE5000', value: won(5000),
        minimumOrder: won(0), scope: { productIds: ['p-tee'] },
      },
    });
    expect(r.couponDiscount).toBe(0);
  });

  it('브랜드로도 지정할 수 있다', () => {
    const r = calculateCart({
      lines: [tee, coat],
      coupon: {
        kind: 'amount', code: 'BRANDB', value: won(30_000),
        minimumOrder: won(0), scope: { brandIds: ['b-b'] },
      },
    });
    expect(r.couponDiscount).toBe(30_000);
  });

  it('상품과 브랜드를 겹쳐 쓰면 둘 중 하나만 걸려도 대상이다', () => {
    const r = calculateCart({
      lines: [tee, coat],
      coupon: {
        kind: 'percent', code: 'MIX', percent: 10,
        maxDiscount: null, minimumOrder: won(0),
        scope: { productIds: ['p-tee'], brandIds: ['b-b'] },
      },
    });
    // 둘 다 대상이므로 220,000 의 10%
    expect(r.couponDiscount).toBe(22_000);
  });

  it('대상을 정하지 않으면 예전처럼 장바구니 전체다', () => {
    const r = calculateCart({
      lines: [tee, coat],
      coupon: { kind: 'amount', code: 'ALL', value: won(5000), minimumOrder: won(0) },
    });
    expect(r.couponDiscount).toBe(5000);
  });

  it('할인이 대상 줄 합계를 넘지 않는다', () => {
    const r = calculateCart({
      lines: [tee, coat],
      coupon: {
        kind: 'amount', code: 'BIG', value: won(999_999),
        minimumOrder: won(0), scope: { productIds: ['p-tee'] },
      },
    });
    expect(r.couponDiscount).toBe(20_000);
    expect(r.payable).toBeGreaterThanOrEqual(200_000);
  });
});

/**
 * **경계가 어디에도 적혀 있지 않았다.**
 *
 * 쿠폰은 "못 미치면 안 된다" 만, 포인트는 "최소 단위 미만이면 무시한다" 만 검사했다. 그래서 금액이
 * 경계와 **꼭 같을 때** 어느 쪽인지는 코드만 알았고, 화면이 "3,000원 더 담으면 됩니다" 라고 말한 그
 * 금액이 1원 단위까지 맞는지는 아무도 안 봤다. 여기서 틀리면 조용히 돈이 어긋난다 — 손님은 쿠폰이
 * 왜 안 붙는지 모르고, 운영은 할인이 왜 나갔는지 모른다.
 */
describe('쿠폰 최소 주문 금액의 경계', () => {
  const minimum = won(30_000);
  const coupon: Coupon = { kind: 'amount', code: 'WELCOME', value: won(10_000), minimumOrder: minimum };
  const lineOf = (price: number): CartLine => ({
    ...knit, listPrice: won(price), salePrice: won(price), quantity: 1,
  });

  it('대상 합계가 최소 주문 금액과 꼭 같으면 적용된다 — 경계는 그 금액을 품는다', () => {
    const t = calculateCart({ lines: [lineOf(30_000)], coupon });

    expect(t.couponDiscount).toBe(10_000);
  });

  it('1원 모자라면 한 푼도 깎이지 않는다', () => {
    const t = calculateCart({ lines: [lineOf(29_999)], coupon });

    expect(t.couponDiscount).toBe(0);
  });

  /** "1원 더 담으면 됩니다" 가 1원 단위에서도 참말이어야 한다 */
  it('모자란 금액은 최소 주문 금액과 대상 합계의 차와 정확히 같다', () => {
    const blocker = couponBlocker(coupon, [lineOf(29_999)]);

    expect(blocker).toEqual({ reason: 'BELOW_MINIMUM', minimum, shortfall: 1 });
  });

  it('말한 만큼 더 담으면 실제로 깎인다 — 그 양이 1원일 때도', () => {
    const blocker = couponBlocker(coupon, [lineOf(29_999)]);
    const shortfall = blocker?.reason === 'BELOW_MINIMUM' ? blocker.shortfall : 0;

    const filled = [lineOf(29_999), lineOf(shortfall)];

    expect(couponBlocker(coupon, filled)).toBeNull();
    expect(discountFor(coupon, filled)).toBe(10_000);
  });
});

/**
 * **하한이 요청에만 걸려 있었다.**
 *
 * 999P 를 가진 사람이 1,000P 를 요청하면 보유한 만큼 깎여 **999P 가 쓰였다** — 999P 를 그대로
 * 요청하면 거절되는데 1,000P 라고 적으면 통과하는 셈이다. 결제 화면은 "1,000P 부터" 라고 적는다.
 *
 * 다만 **낼 돈 전부를 포인트로 내는 길은 막지 않는다.** 하한은 "잔돈처럼 쓰지 말라" 는 뜻이고,
 * 500원짜리 주문을 500P 로 끝내는 것은 거기에 어긋나지 않는다 — 막으면 적은 금액의 주문에서는
 * 포인트를 아예 못 쓴다.
 */
describe('포인트 사용의 경계', () => {
  const cheap = (price: number): CartLine => ({
    ...knit, listPrice: won(price), salePrice: won(price), quantity: 1,
  });

  it('최소 사용 단위와 꼭 같은 금액은 쓸 수 있다', () => {
    const t = calculateCart({
      lines: [coat], pointsToUse: won(MIN_POINTS_USE), pointsAvailable: won(MIN_POINTS_USE),
    });

    expect(t.pointsUsed).toBe(MIN_POINTS_USE);
  });

  it('보유가 요청보다 1원 모자라면 보유한 만큼만 쓴다', () => {
    const t = calculateCart({
      lines: [coat], pointsToUse: won(5_000), pointsAvailable: won(4_999),
    });

    expect(t.pointsUsed).toBe(4_999);
  });

  /** 1,000P 라고 적으면 통과하던 자리 — 보유가 하한에 못 미치면 쓸 수 없다 */
  it('보유가 최소 사용 단위에 1원 모자라면 한 푼도 못 쓴다', () => {
    const t = calculateCart({
      lines: [coat], pointsToUse: won(MIN_POINTS_USE), pointsAvailable: won(MIN_POINTS_USE - 1),
    });

    expect(t.pointsUsed).toBe(0);
  });

  it('전액 포인트로 내면 낼 돈은 배송비만 남는다', () => {
    const t = calculateCart({
      lines: [cheap(20_000)], pointsToUse: won(20_000), pointsAvailable: won(20_000),
    });

    expect(t.pointsUsed).toBe(20_000);
    expect(t.payable).toBe(DEFAULT_SHIPPING.baseFee);
  });

  it('전액 포인트로 내면 적립이 없다 — 현금이 오간 몫이 없다', () => {
    const t = calculateCart({
      lines: [cheap(20_000)], pointsToUse: won(20_000), pointsAvailable: won(20_000),
    });

    expect(t.rewardPoints).toBe(0);
  });

  /** 하한은 "잔돈처럼 쓰지 말라" 는 뜻이다 — 낼 돈 전부를 내는 것은 거기에 어긋나지 않는다 */
  it('낼 돈이 최소 사용 단위보다 적어도 그만큼은 쓸 수 있다', () => {
    const t = calculateCart({
      lines: [cheap(500)], pointsToUse: won(MIN_POINTS_USE), pointsAvailable: won(MIN_POINTS_USE),
    });

    expect(t.pointsUsed).toBe(500);
  });
});

/**
 * **1원 — 가장 작은 금액.**
 *
 * 돈 셈은 내림이 쌓이는 자리에서 틀린다. 1원짜리 한 줄은 적립률을 곱해도 0이고, 정액 쿠폰을 대면
 * 쿠폰이 금액보다 크고, 줄 몫을 나누면 나눌 것이 없다 — 그 어느 쪽도 음수나 NaN 이 되어서는 안 된다.
 */
describe('1원 — 가장 작은 금액', () => {
  const onewon: CartLine = { ...knit, listPrice: won(1), salePrice: won(1), quantity: 1 };

  it('배송비가 붙고 적립은 0이다', () => {
    const t = calculateCart({ lines: [onewon] });

    expect(t.merchandiseTotal).toBe(1);
    expect(t.payable).toBe(DEFAULT_SHIPPING.baseFee + 1);
    expect(t.rewardPoints).toBe(0);
  });

  it('무료배송까지 남은 금액도 1원 단위로 맞는다', () => {
    const t = calculateCart({ lines: [onewon] });

    expect(t.shipping.remainingForFree).toBe((DEFAULT_SHIPPING.freeThreshold ?? 0) - 1);
  });

  it('정액 쿠폰이 1원을 넘겨 깎지 않는다', () => {
    const t = calculateCart({
      lines: [onewon],
      coupon: { kind: 'amount', code: 'BIG', value: won(50_000), minimumOrder: won(0) },
    });

    expect(t.couponDiscount).toBe(1);
    expect(t.payable).toBe(DEFAULT_SHIPPING.baseFee);
  });

  it('줄 몫의 합이 1원에서도 어긋나지 않는다', () => {
    const t = calculateCart({
      lines: [onewon, { ...onewon, variantId: 'v-2' }],
      coupon: { kind: 'amount', code: 'ONE', value: won(1), minimumOrder: won(0) },
    });

    const sum = t.allocations.reduce((n, a) => n + a.couponShare, 0);
    expect(sum).toBe(t.couponDiscount);
  });
});
