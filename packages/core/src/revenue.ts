import type { Won } from './money';
import { nextStatuses, type OrderStatus } from './order-state';

/**
 * 매출을 **언제** 잡는가.
 *
 * 원칙 하나뿐이다 — **돈이 오간 시각에 잡고, 그 뒤로 과거를 건드리지 않는다.**
 *
 * 예전에는 `placedAt` 으로 묶고 **지금 상태**로 걸렀다. 그러면 오늘 반품을
 * 접수하는 순간 그 주문을 산 날의 매출이 줄어든다. 지난주 차트가 이번 주
 * 손님의 행동에 따라 다시 그려지는 것이다. 반품을 철회하면(RETURN_REQUESTED
 * → SHIPPED) 도로 늘어난다. 어느 쪽이든, 어제 본 숫자와 오늘 본 숫자가 다르면
 * 그 숫자로는 아무 결정도 할 수 없다.
 *
 * **반품 접수는 돈이 오간 사건이 아니다.** 접수는 요청일 뿐이고 환불은
 * 나중에 따로 일어난다. 돈이 실제로 나가는 시점은 환불이다.
 */

/** 돈이 되돌아간 상태. 이때가 매출에서 빠지는 시각이다. */
export const REFUND_STATUS = ['CANCELLED', 'REFUNDED'] as const;

export type RefundStatus = (typeof REFUND_STATUS)[number];

export function isRefundStatus(status: OrderStatus): status is RefundStatus {
  return (REFUND_STATUS as readonly OrderStatus[]).includes(status);
}

/**
 * 정산에서 매출로 잡는 상태.
 *
 * 결제 시점이 아니라 구매확정 시점인 이유는, 반품 가능 기간이 지나지 않은
 * 돈을 가맹점에 넘기지 않기 위해서다.
 */
export const SETTLEMENT_SALE_STATUS = 'CONFIRMED' as const satisfies OrderStatus;

/**
 * 정산에서 빼도 되는 환불인가.
 *
 * **이미 지급한 적 있는 것만 뺀다.** 구매확정에 이른 적이 없는 주문은 가맹점
 * 정산에 실린 적도 없다. 그것을 빼면 다른 주문으로 번 돈에서 깎이고, 가맹점은
 * 받은 적 없는 돈을 토해내게 된다.
 *
 * 지금 상태 기계에서 구매확정은 **종착**이라 확정된 주문은 환불될 수 없다
 * (`test/revenue.test.ts` 가 이 전제를 지킨다). 그래서 이 함수는 사실상 늘
 * false 를 돌려준다. 그럼에도 조건을 지우지 않는 이유는, 나중에 확정 뒤 환불을
 * 허용하게 되면 **규칙이 저절로 맞기** 때문이다. 지워 두면 그날 조용히 틀린다.
 */
export function deductibleFromSettlement(order: {
  readonly status: OrderStatus;
  readonly confirmedAt: Date | null;
}): boolean {
  return isRefundStatus(order.status) && order.confirmedAt !== null;
}

/** 구매확정에서 갈 수 있는 곳. 정산 차감 규칙이 이 사실 위에 서 있다. */
export function statusesAfterSettlementSale(): readonly OrderStatus[] {
  return nextStatuses(SETTLEMENT_SALE_STATUS);
}

export interface RevenueTotals {
  /** 들어온 돈 */
  readonly gross: Won;
  /** 되돌아간 돈 */
  readonly refunded: Won;
  /** 남은 돈 */
  readonly net: Won;
}

/**
 * 환불은 **뺀 것으로 보여 주되 감추지 않는다.**
 *
 * 순매출 하나만 두면 그 숫자가 왜 그런지 알 수 없고, 총매출 하나만 두면
 * 실제로 남은 돈보다 커 보인다. 셋을 다 적어야 대조가 된다.
 */
export function netRevenue(gross: number, refunded: number): RevenueTotals {
  return { gross: gross as Won, refunded: refunded as Won, net: (gross - refunded) as Won };
}
