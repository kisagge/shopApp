import { type Won, won, ZERO, gte } from './money';

export interface ShippingPolicy {
  /** 기본 배송비 */
  readonly baseFee: Won;
  /** 이 금액 이상이면 무료배송. null이면 무료배송 없음 */
  readonly freeThreshold: Won | null;
  /** 제주·도서산간 추가 배송비 */
  readonly remoteSurcharge: Won;
}

export const DEFAULT_SHIPPING: ShippingPolicy = {
  baseFee: won(3000),
  freeThreshold: won(50_000),
  remoteSurcharge: won(3000),
};

export interface ShippingInput {
  /** 할인 적용 후 상품 금액. 무료배송 판정 기준 */
  readonly merchandiseTotal: Won;
  readonly isRemoteArea: boolean;
  readonly policy?: ShippingPolicy;
}

export interface ShippingResult {
  readonly fee: Won;
  readonly surcharge: Won;
  readonly isFree: boolean;
  /** 무료배송까지 남은 금액. 이미 무료면 0 */
  readonly remainingForFree: Won;
}

export function calculateShipping(input: ShippingInput): ShippingResult {
  const policy = input.policy ?? DEFAULT_SHIPPING;
  const isFree =
    policy.freeThreshold !== null && gte(input.merchandiseTotal, policy.freeThreshold);

  const surcharge = input.isRemoteArea ? policy.remoteSurcharge : ZERO;
  const base = isFree ? ZERO : policy.baseFee;

  const remainingForFree =
    policy.freeThreshold === null || isFree
      ? ZERO
      : won(policy.freeThreshold - input.merchandiseTotal);

  // 도서산간 추가비는 무료배송이어도 청구한다 — 국내 커머스 관행.
  return { fee: won(base + surcharge), surcharge, isFree, remainingForFree };
}
