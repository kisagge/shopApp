/**
 * 주문 영수증에 적는 금액.
 *
 * **결제 금액을 줄여 적지 않는다.** 결제는 그 금액으로 됐고 카드 명세서에도 그렇게 찍힌다. 돌려준 돈은 따로
 * 적고, 끝에 "실제로 낸 돈" 을 한 줄 더한다 — 경비 처리하는 사람이 보는 줄은 그것이다.
 *
 * 주문 상세와 영수증이 같은 함수를 쓴다. 따로 더하면 두 화면의 환불 합이 갈린다.
 */
export interface ReceiptRefund {
  readonly amount: number;
  readonly points: number;
  readonly shippingDeducted: number;
}

export interface ReceiptTotals {
  /** 결제한 금액 그대로 */
  readonly paid: number;
  /** 돌려준 현금(카드 취소 포함) */
  readonly refundedCash: number;
  /** 돌려준 포인트 */
  readonly refundedPoints: number;
  /** 일부 취소로 무료배송이 깨져 환불에서 뺀 배송비 */
  readonly shippingDeducted: number;
  /** 결제 − 돌려준 현금. 음수가 되면 장부가 틀린 것이라 0 에서 멈추지 않고 그대로 드러낸다 */
  readonly net: number;
}

export function receiptTotals(payable: number, refunds: readonly ReceiptRefund[]): ReceiptTotals {
  const refundedCash = refunds.reduce((sum, r) => sum + r.amount, 0);
  return {
    paid: payable,
    refundedCash,
    refundedPoints: refunds.reduce((sum, r) => sum + r.points, 0),
    shippingDeducted: refunds.reduce((sum, r) => sum + r.shippingDeducted, 0),
    net: payable - refundedCash,
  };
}

/**
 * 영수증을 낼 수 있는 주문인가 — **돈이 들어온 적이 있어야 한다.**
 *
 * 결제대기 주문에 영수증을 내면 내지 않은 돈의 증빙이 된다. 결제 뒤 전액 환불된 주문은 낸다: 결제와 환불이
 * 둘 다 일어난 일이고, 카드 명세서에 두 줄이 찍혀 있어 맞춰 볼 문서가 필요하다.
 */
export const isReceiptIssuable = (order: { readonly paidAt: Date | null }): boolean => order.paidAt !== null;
