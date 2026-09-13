import { type Won, won, ZERO, gte } from './money';

export interface ShippingPolicy {
  /** 기본 배송비 */
  readonly baseFee: Won;
  /** 이 금액 이상이면 무료배송. null이면 무료배송 없음 */
  readonly freeThreshold: Won | null;
  /** 제주·도서산간 추가 배송비 */
  readonly remoteSurcharge: Won;
}

/**
 * 아무도 정하지 않았을 때 쓰는 값.
 *
 * **정책은 이제 운영이 정한다**(`shipping_policy` 표). 여기 남은 것은 그 줄이
 * 아직 없을 때 — 마이그레이션 직후나 갓 만든 DB — 가게가 돌아가게 하는
 * 바닥값이다. 계산 **규칙**은 여전히 코드에 있다. 바깥에서 오는 것은 숫자뿐이다.
 */
export const DEFAULT_SHIPPING: ShippingPolicy = {
  baseFee: won(3000),
  freeThreshold: won(50_000),
  remoteSurcharge: won(3000),
};

/**
 * 바깥에서 온 숫자를 정책으로 세운다.
 *
 * **DB 값을 그대로 믿지 않는다.** 음수 배송비나 기본료보다 낮은 무료 기준이
 * 들어오면 금액 계산이 통째로 이상해지는데, 그건 화면에서 알아보기 어렵다.
 * 읽는 자리에서 한 번 거른다 — 어긋나면 그 칸만 바닥값으로 되돌린다.
 */
export function shippingPolicyFrom(row: {
  readonly baseFee: number;
  readonly freeThreshold: number | null;
  readonly remoteSurcharge: number;
}): ShippingPolicy {
  const safe = (value: number, fallback: Won): Won =>
    Number.isInteger(value) && value >= 0 ? won(value) : fallback;

  return {
    baseFee: safe(row.baseFee, DEFAULT_SHIPPING.baseFee),
    /*
     * 무료 기준은 **없을 수 있다**(무료배송을 안 하는 가게). 그래서 null 은
     * 잘못된 값이 아니라 뜻이 있는 값이고, 바닥값으로 되돌리면 안 된다.
     */
    freeThreshold:
      row.freeThreshold === null
        ? null
        : safe(row.freeThreshold, DEFAULT_SHIPPING.freeThreshold ?? won(0)),
    remoteSurcharge: safe(row.remoteSurcharge, DEFAULT_SHIPPING.remoteSurcharge),
  };
}

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
