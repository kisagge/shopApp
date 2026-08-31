import {
  type Won, won, ZERO, add, multiply, min, subtractToZero, percentOf, MoneyError,
} from './money';
import { calculateShipping, type ShippingPolicy, type ShippingResult } from './shipping';

export interface CartLine {
  readonly variantId: string;
  readonly productName: string;
  /** 정가 */
  readonly listPrice: Won;
  /** 상품 자체 할인율(%). 0이면 할인 없음 */
  readonly discountPercent: number;
  readonly quantity: number;
}

export type Coupon =
  | { readonly kind: 'amount'; readonly code: string; readonly value: Won; readonly minimumOrder: Won }
  | { readonly kind: 'percent'; readonly code: string; readonly percent: number; readonly maxDiscount: Won | null; readonly minimumOrder: Won };

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
    const listSubtotal = multiply(line.listPrice, line.quantity);
    const discount = percentOf(listSubtotal, line.discountPercent);
    return { variantId: line.variantId, listSubtotal, discount, subtotal: won(listSubtotal - discount) };
  });

  const listTotal = add(...lines.map((l) => l.listSubtotal));
  const productDiscount = add(...lines.map((l) => l.discount));
  const merchandiseTotal = won(listTotal - productDiscount);

  const couponDiscount = resolveCoupon(input.coupon, merchandiseTotal);
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
