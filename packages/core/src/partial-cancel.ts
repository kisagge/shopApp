import { type Won, won } from './money';
import { calculateShipping, type ShippingPolicy } from './shipping';

/**
 * 부분 취소 — 주문의 **일부 줄만** 되돌리는 계산.
 *
 * 전액 취소는 쉽다. 받은 것을 전부 돌려주면 된다. 줄 하나를 되돌리는 순간 세 가지를
 * 정해야 한다.
 *
 * 1. **쿠폰·포인트가 그 줄에 얼마나 붙어 있었나.** 주문 전체에 5,000원 쿠폰을 썼는데
 *    두 줄 중 하나를 취소하면, 그 줄 몫의 할인만큼은 돌려받을 돈에서 빠져야 한다.
 *    안 빼면 쿠폰을 쓰고 비싼 줄을 취소하는 것만으로 할인을 현금으로 바꿀 수 있다.
 * 2. **남은 상품이 무료배송 기준 아래로 떨어지면.** 5만원 넘겨 무료배송을 받고 4만원어치를
 *    취소하면, 남은 1만원은 원래 배송비를 냈어야 했다. 그 차이를 돌려줄 돈에서 뗀다.
 * 3. **다 취소하면.** 마지막 줄까지 가면 전액 취소다 — 받은 돈과 포인트를 남김없이
 *    돌려주고, 앞에서 뗀 배송비도 돌려준다. 보낸 물건이 없다.
 *
 * 쿠폰은 **되살리지 않는다.** 남은 줄이 여전히 그 쿠폰으로 깎인 값이다. 남은 금액이
 * 쿠폰의 최소 주문 금액 아래로 떨어져도 남은 줄의 몫은 그대로 둔다 — 비례로 나눴으므로
 * 남은 줄이 받는 할인은 원래 자기 몫뿐이고, 취소로 할인이 커지지 않는다.
 */

export class PartialCancelError extends Error {
  constructor(
    readonly code:
      | 'NO_ITEMS'
      | 'UNKNOWN_ITEM'
      | 'ALREADY_CANCELED'
      | 'ALL_ITEMS'
      | 'SHIPPING_EXCEEDS_REFUND',
    message: string,
  ) {
    super(message);
    this.name = 'PartialCancelError';
  }
}

/**
 * 정수 금액을 가중치대로 나눈다 — 최대 나머지법.
 *
 * 비율대로 나눠 버림하면 합이 원래 금액보다 모자란다(10원을 셋에 나누면 3·3·3).
 * 모자란 원은 **버림으로 가장 많이 잘린 줄부터** 하나씩 준다. 동점이면 앞 줄이다 —
 * 같은 입력이면 늘 같은 결과가 나와야 두 번째 부분 취소가 첫 번째와 어긋나지 않는다.
 *
 * 곱이 2^53 을 넘을 수 있어(1억원 × 1억원) BigInt 로 센다.
 */
export function allocateByWeight(total: number, weights: readonly number[]): number[] {
  if (!Number.isInteger(total) || total < 0) {
    throw new RangeError(`나눌 금액은 0 이상의 정수여야 합니다: ${total}`);
  }
  if (weights.some((w) => !Number.isInteger(w) || w < 0)) {
    throw new RangeError('가중치는 0 이상의 정수여야 합니다');
  }
  if (weights.length === 0) return [];

  const sum = weights.reduce((a, b) => a + b, 0);
  // 가중치가 모두 0 이면 비율이 없다. 금액이 있으면 첫 줄이 받는다 — 흘리지 않는다.
  if (sum === 0) return weights.map((_, i) => (i === 0 ? total : 0));

  const T = BigInt(total);
  const W = BigInt(sum);
  const shares = weights.map((w) => (T * BigInt(w)) / W);
  const remainders = weights.map((w, i) => ({ i, r: (T * BigInt(w)) % W }));

  let left = Number(T - shares.reduce((a, b) => a + b, 0n));
  remainders.sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  for (const { i } of remainders) {
    if (left === 0) break;
    shares[i] = shares[i]! + 1n;
    left -= 1;
  }
  return shares.map(Number);
}

export interface LineShare {
  /** 이 줄에 붙은 쿠폰 할인 */
  readonly couponShare: Won;
  /** 이 줄 값을 포인트로 낸 몫 */
  readonly pointsShare: Won;
  /** 구매확정 때 이 줄로 쌓일 적립 */
  readonly rewardShare: Won;
}

/**
 * 주문 금액을 줄마다 나눈다. 주문을 만들 때 한 번 계산해 줄에 박는다.
 *
 * - 쿠폰은 **대상 줄에만** 판매가 비율로. 대상이 정해진 쿠폰을 전 줄에 나누면 대상 아닌
 *   상품을 취소할 때 받지도 않은 할인을 떼게 된다.
 * - 포인트는 쿠폰을 뺀 값 비율로 — 계산 순서(상품 할인 → 쿠폰 → 포인트)를 따른다.
 * - 적립은 현금으로 낸 몫 비율로 — 적립 기준이 그렇다(calculateCart).
 */
export function allocateOrderLines(
  lines: readonly { readonly subtotal: number; readonly couponEligible: boolean }[],
  amounts: { readonly couponDiscount: number; readonly pointsUsed: number; readonly rewardPoints: number },
): LineShare[] {
  const anyEligible = lines.some((l) => l.couponEligible);
  const coupon = allocateByWeight(
    amounts.couponDiscount,
    lines.map((l) => (anyEligible && !l.couponEligible ? 0 : l.subtotal)),
  );
  const points = allocateByWeight(
    amounts.pointsUsed,
    lines.map((l, i) => Math.max(0, l.subtotal - coupon[i]!)),
  );
  const reward = allocateByWeight(
    amounts.rewardPoints,
    lines.map((l, i) => Math.max(0, l.subtotal - coupon[i]! - points[i]!)),
  );
  return lines.map((_, i) => ({
    couponShare: won(coupon[i]!),
    pointsShare: won(points[i]!),
    rewardShare: won(reward[i]!),
  }));
}

export interface CancelableLine {
  readonly id: string;
  readonly subtotal: number;
  /** 옛 주문은 줄에 몫이 없다 — null 이면 `sharesOf` 가 채운다 */
  readonly couponShare: number | null;
  readonly pointsShare: number | null;
  readonly rewardShare: number | null;
  readonly canceled: boolean;
}

/**
 * 줄의 몫. **옛 주문은 몫을 박아 두지 않았다.**
 *
 * 그때는 어느 줄이 쿠폰 대상이었는지도 남기지 않아서 정확히 되살릴 방법이 없다. 전 줄을
 * 대상으로 보고 판매가 비율로 나눈다 — 대상 쿠폰을 쓴 옛 주문에서는 실제와 조금 다를 수
 * 있지만, 합은 언제나 주문에 적힌 할인·포인트와 같다. 돈이 새지는 않는다.
 */
export function sharesOf(
  lines: readonly CancelableLine[],
  order: { readonly couponDiscount: number; readonly pointsUsed: number; readonly rewardPoints: number },
): LineShare[] {
  if (lines.every((l) => l.couponShare !== null && l.pointsShare !== null && l.rewardShare !== null)) {
    return lines.map((l) => ({
      couponShare: won(l.couponShare!),
      pointsShare: won(l.pointsShare!),
      rewardShare: won(l.rewardShare!),
    }));
  }
  return allocateOrderLines(
    lines.map((l) => ({ subtotal: l.subtotal, couponEligible: true })),
    order,
  );
}

export interface PartialCancelInput {
  readonly lines: readonly CancelableLine[];
  readonly cancelIds: readonly string[];
  readonly order: {
    readonly couponDiscount: number;
    readonly pointsUsed: number;
    readonly rewardPoints: number;
    /** 주문 때 낸 배송비(도서산간 포함) */
    readonly shippingFee: number;
    readonly isRemoteArea: boolean;
  };
  /** 주문 때의 배송비 정책. 옛 주문은 지금 정책을 넘긴다 */
  readonly policy: ShippingPolicy;
  /** 앞선 부분 취소에서 이미 뗀 배송비 */
  readonly shippingDeductedSoFar: number;
  /**
   * 무료배송 기준 아래로 떨어질 때 배송비를 떼는가. 기본은 뗀다.
   *
   * 반품에서는 **판매자 귀책(불량·오배송·파손)이면 떼지 않는다.** 판매자 잘못으로 돌려보낸
   * 물건 때문에 손님이 원래 안 내던 배송비를 무는 셈이 된다. 단순 변심이면 뗀다 — 반송비를
   * 손님이 내는 것과 같은 이유다.
   */
  readonly chargeShipping?: boolean | undefined;
}

export interface PartialCancelPlan {
  readonly itemIds: readonly string[];
  /** 결제 수단으로 돌려줄 돈 */
  readonly cash: Won;
  /** 포인트로 돌려줄 몫 */
  readonly points: Won;
  /** 이번에 뗀 배송비 */
  readonly shippingDeducted: Won;
  /** 구매확정 때 줄 적립에서 빠지는 몫 */
  readonly rewardReduced: Won;
  /** 취소 뒤 남는 상품 금액(판매가 합) */
  readonly remainingMerchandise: Won;
}

export function planPartialCancel(input: PartialCancelInput): PartialCancelPlan {
  const wanted = new Set(input.cancelIds);
  if (wanted.size === 0) throw new PartialCancelError('NO_ITEMS', '취소할 상품을 골라 주세요.');

  const byId = new Map(input.lines.map((l) => [l.id, l]));
  for (const id of wanted) {
    const line = byId.get(id);
    if (!line) throw new PartialCancelError('UNKNOWN_ITEM', '이 주문에 없는 상품입니다.');
    if (line.canceled) throw new PartialCancelError('ALREADY_CANCELED', '이미 취소된 상품입니다.');
  }

  const active = input.lines.filter((l) => !l.canceled);
  if (active.every((l) => wanted.has(l.id))) {
    // 남는 줄이 없으면 전액 취소다. 뗀 배송비를 돌려주는 규칙이 달라서 길을 나눈다.
    throw new PartialCancelError('ALL_ITEMS', '남는 상품이 없어 주문 전체를 취소합니다.');
  }

  const shares = sharesOf(input.lines, input.order);
  let cash = 0;
  let points = 0;
  let reward = 0;
  let remaining = 0;
  input.lines.forEach((line, i) => {
    const share = shares[i]!;
    if (wanted.has(line.id)) {
      cash += line.subtotal - share.couponShare - share.pointsShare;
      points += share.pointsShare;
      reward += share.rewardShare;
    } else if (!line.canceled) {
      remaining += line.subtotal;
    }
  });

  /*
   * **남은 것만 샀다면 냈을 배송비**와 실제로 낸 배송비의 차이. 도서산간 추가비는 양쪽에
   * 똑같이 들어 있어 지워진다. 이미 뗀 만큼은 다시 떼지 않는다 — 두 번에 나눠 취소해도
   * 한 번에 취소한 것과 같은 금액이어야 한다.
   */
  const feeForRemaining = calculateShipping({
    merchandiseTotal: won(remaining),
    isRemoteArea: input.order.isRemoteArea,
    policy: input.policy,
  }).fee;
  const owed = Math.max(0, feeForRemaining - input.order.shippingFee);
  const deduct = input.chargeShipping === false ? 0 : Math.max(0, owed - input.shippingDeductedSoFar);

  // 현금에서 먼저 떼고, 모자라면 포인트에서 뗀다
  const fromCash = Math.min(cash, deduct);
  const fromPoints = deduct - fromCash;
  if (fromPoints > points) {
    throw new PartialCancelError(
      'SHIPPING_EXCEEDS_REFUND',
      '이 상품만 취소하면 돌려받을 금액보다 배송비가 커집니다. 주문 전체를 취소해 주세요.',
    );
  }

  return {
    itemIds: input.lines.filter((l) => wanted.has(l.id)).map((l) => l.id),
    cash: won(cash - fromCash),
    points: won(points - fromPoints),
    shippingDeducted: won(deduct),
    rewardReduced: won(reward),
    remainingMerchandise: won(remaining),
  };
}

/**
 * 남은 것을 전부 되돌릴 때 돌려줄 돈과 포인트.
 *
 * 앞선 부분 취소가 돌려준 만큼을 뺀다. 전액 취소가 **주문에 적힌 결제액을 통째로**
 * 돌려주면, 부분 취소를 먼저 한 주문에서는 같은 돈이 두 번 나간다.
 */
export function remainingRefund(input: {
  readonly payable: number;
  readonly cashRefunded: number;
  readonly pointsUsed: number;
  readonly pointsReturned: number;
}): { readonly cash: Won; readonly points: Won } {
  return {
    cash: won(Math.max(0, input.payable - input.cashRefunded)),
    points: won(Math.max(0, input.pointsUsed - input.pointsReturned)),
  };
}
