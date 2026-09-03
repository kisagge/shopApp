import {
  type Won, won, ZERO, add, multiply, min, subtractToZero, percentOf, MoneyError,
} from './money';
import { calculateShipping, type ShippingPolicy, type ShippingResult } from './shipping';

export interface CartLine {
  readonly variantId: string;
  readonly productName: string;
  /** 정가. 취소선으로 보여 주는 값 */
  readonly listPrice: Won;
  /**
   * 실제 판매 단가. 할인이 없으면 listPrice 와 같다.
   *
   * 할인율이 아니라 판매가를 받는다. 할인율에서 판매가를 계산하면
   * 413,000 의 30% 는 289,100 이 되는데, 국내 커머스는 289,000 처럼
   * 딱 떨어지는 값을 판매가로 정하고 할인율을 거기서 표시한다.
   */
  readonly salePrice: Won;
  readonly quantity: number;
  /** 쿠폰 적용 대상 판정에 쓴다. 전체 대상 쿠폰만 쓸 때는 없어도 된다. */
  readonly productId?: string | undefined;
  readonly brandId?: string | undefined;
  readonly categoryId?: string | undefined;
}

/**
 * 쿠폰이 어디에 붙는가.
 *
 * `null` 이면 장바구니 전체. 아니면 그 목록에 해당하는 줄에만 붙는다.
 */
export interface CouponScope {
  readonly productIds?: readonly string[] | undefined;
  readonly brandIds?: readonly string[] | undefined;
  readonly categoryIds?: readonly string[] | undefined;
}

interface CouponBase {
  readonly code: string;
  readonly minimumOrder: Won;
  /** 없으면 전체 대상 */
  readonly scope?: CouponScope | undefined;
}

export type Coupon =
  | ({ readonly kind: 'amount'; readonly value: Won } & CouponBase)
  | ({ readonly kind: 'percent'; readonly percent: number; readonly maxDiscount: Won | null } & CouponBase);

export interface CartInput {
  readonly lines: readonly CartLine[];
  readonly coupon?: Coupon | undefined;
  /** 사용하려는 포인트 */
  readonly pointsToUse?: Won | undefined;
  /** 보유 포인트 */
  readonly pointsAvailable?: Won | undefined;
  readonly isRemoteArea?: boolean | undefined;
  readonly shippingPolicy?: ShippingPolicy | undefined;
  /** 구매 확정 시 적립률(%). 기본 1% */
  readonly rewardPercent?: number | undefined;
}

export interface CartLineTotal {
  readonly variantId: string;
  readonly listSubtotal: Won;
  readonly discount: Won;
  readonly subtotal: Won;
}

export interface CartTotals {
  readonly lines: readonly CartLineTotal[];
  /** 정가 합계 */
  readonly listTotal: Won;
  /** 상품 할인 합계 */
  readonly productDiscount: Won;
  /** 상품 할인 적용 후 */
  readonly merchandiseTotal: Won;
  readonly couponDiscount: Won;
  readonly pointsUsed: Won;
  readonly shipping: ShippingResult;
  /** 실제 결제 금액 */
  readonly payable: Won;
  /** 구매 확정 시 적립 예정 포인트 */
  readonly rewardPoints: Won;
}

/** 포인트 최소 사용 단위 */
export const MIN_POINTS_USE = won(1000);
const DEFAULT_REWARD_PERCENT = 1;

/**
 * 할인 적용 순서는 금액이 달라지므로 정책이다.
 * 상품 할인 → 쿠폰 → 포인트 순으로 적용한다. 쿠폰은 배송비에 붙지 않고,
 * 무료배송 판정은 쿠폰·포인트 차감 전 금액(merchandiseTotal)으로 한다 —
 * 쿠폰 때문에 배송비가 되살아나면 고객이 납득하지 못한다.
 */
export function calculateCart(input: CartInput): CartTotals {
  if (input.lines.length === 0) {
    const shipping = calculateShipping({ merchandiseTotal: ZERO, isRemoteArea: false });
    return {
      lines: [], listTotal: ZERO, productDiscount: ZERO, merchandiseTotal: ZERO,
      couponDiscount: ZERO, pointsUsed: ZERO,
      shipping: { ...shipping, fee: ZERO, remainingForFree: ZERO },
      payable: ZERO, rewardPoints: ZERO,
    };
  }

  const lines = input.lines.map<CartLineTotal>((line) => {
    if (line.quantity < 1) {
      throw new MoneyError(`수량은 1개 이상이어야 합니다: ${line.productName}`);
    }
    if (line.salePrice > line.listPrice) {
      throw new MoneyError(`판매가가 정가보다 클 수 없습니다: ${line.productName}`);
    }
    const listSubtotal = multiply(line.listPrice, line.quantity);
    const subtotal = multiply(line.salePrice, line.quantity);
    return {
      variantId: line.variantId,
      listSubtotal,
      discount: won(listSubtotal - subtotal),
      subtotal,
    };
  });

  const listTotal = add(...lines.map((l) => l.listSubtotal));
  const productDiscount = add(...lines.map((l) => l.discount));
  const merchandiseTotal = won(listTotal - productDiscount);

  /**
   * 쿠폰이 붙는 금액.
   *
   * 대상이 정해진 쿠폰은 **그 상품 줄의 합계**에만 붙는다. 장바구니 전체를
   * 기준으로 삼으면 두 가지가 한꺼번에 잘못된다.
   * 1) 5,000원짜리 티셔츠 전용 10,000원 쿠폰이 다른 상품 값까지 깎는다.
   * 2) 최소 주문 금액을 대상 아닌 상품으로 채울 수 있다.
   */
  const couponBase = eligibleTotal(input.coupon, input.lines, lines);
  const couponDiscount = resolveCoupon(input.coupon, couponBase);
  const afterCoupon = subtractToZero(merchandiseTotal, couponDiscount);

  const pointsUsed = resolvePoints(input.pointsToUse, input.pointsAvailable, afterCoupon);
  const afterPoints = subtractToZero(afterCoupon, pointsUsed);

  const shipping = calculateShipping({
    merchandiseTotal,
    isRemoteArea: input.isRemoteArea ?? false,
    ...(input.shippingPolicy ? { policy: input.shippingPolicy } : {}),
  });

  const payable = add(afterPoints, shipping.fee);

  // 적립은 실제로 현금이 오간 상품 금액 기준. 포인트로 결제한 몫은 적립하지 않는다.
  const rewardBase = afterPoints;
  const rewardPoints = percentOf(rewardBase, input.rewardPercent ?? DEFAULT_REWARD_PERCENT);

  return {
    lines, listTotal, productDiscount, merchandiseTotal,
    couponDiscount, pointsUsed, shipping, payable, rewardPoints,
  };
}

/** 쿠폰 대상 줄들의 판매가 합계. 대상이 없으면 전체 합계. */
function eligibleTotal(
  coupon: Coupon | undefined,
  inputLines: readonly CartLine[],
  totals: readonly CartLineTotal[],
): Won {
  const all = add(...totals.map((l) => l.subtotal));
  const scope = coupon?.scope;
  if (!scope) return all;

  const has = (list: readonly string[] | undefined, value: string | undefined) =>
    list !== undefined && list.length > 0 && value !== undefined && list.includes(value);

  // 셋 중 하나라도 걸리면 대상이다. 브랜드 전체를 열어 두고 그중 한 상품을
  // 따로 지정하는 식으로 겹쳐 쓸 수 있어야 한다.
  const eligible = totals.filter((_, i) => {
    const line = inputLines[i];
    if (!line) return false;
    return (
      has(scope.productIds, line.productId) ||
      has(scope.brandIds, line.brandId) ||
      has(scope.categoryIds, line.categoryId)
    );
  });

  return add(...eligible.map((l) => l.subtotal));
}

function resolveCoupon(coupon: Coupon | undefined, base: Won): Won {
  if (!coupon) return ZERO;
  if (base < coupon.minimumOrder) return ZERO;

  if (coupon.kind === 'amount') return min(coupon.value, base);

  const raw = percentOf(base, coupon.percent);
  const capped = coupon.maxDiscount === null ? raw : min(raw, coupon.maxDiscount);
  return min(capped, base);
}

function resolvePoints(
  requested: Won | undefined,
  available: Won | undefined,
  base: Won,
): Won {
  if (requested === undefined || requested <= 0) return ZERO;
  if (requested < MIN_POINTS_USE) return ZERO;
  const owned = available ?? ZERO;
  return min(min(requested, owned), base);
}
