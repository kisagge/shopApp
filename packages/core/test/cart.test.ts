import { describe, it, expect } from 'vitest';
import { won, MoneyError } from '../src/money';
import { calculateCart, MIN_POINTS_USE, type CartLine, type Coupon } from '../src/cart';

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
