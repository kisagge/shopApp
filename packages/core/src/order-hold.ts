/**
 * 결제되지 않은 주문이 재고를 언제까지 물고 있어도 되는가. 순수 로직만.
 *
 * 주문을 만드는 순간 재고를 깎는다 — 그래야 두 사람이 같은 마지막 하나를
 * 살 수 없다. 대신 **결제하지 않고 떠난 주문이 그 재고를 영영 물고 있는다.**
 * 실제로 그렇게 됐다: 닷새 된 결제 대기 주문 셋이 코트 둘과 니트 하나를
 * 잡고 있었다. 팔 수 있는 물건이 조용히 품절로 보인다.
 *
 * 그래서 기한을 두고 푼다. 문제는 **풀면 안 되는 것을 푸는 것**이라, 판정을
 * 좁게 잡는다.
 */

/**
 * 결제 대기 주문이 재고를 잡고 있어도 되는 시간.
 *
 * 카드 결제창에서 인증까지 걸리는 시간을 넉넉히 잡은 값이다. 이보다 짧으면
 * 느리게 결제하는 사람의 주문을 뺏고, 길면 재고가 그만큼 오래 묶인다.
 */
export const PAYMENT_HOLD_MINUTES = 30;

export function paymentHoldCutoff(now: Date, minutes = PAYMENT_HOLD_MINUTES): Date {
  return new Date(now.getTime() - minutes * 60 * 1000);
}

/**
 * 자동으로 풀어도 되는 결제 상태.
 *
 * **READY 하나뿐이다.** 나머지는 전부 사람이 봐야 한다.
 *   - IN_PROGRESS: 승인이 오가는 중이다. 지금 풀면 승인된 주문의 재고를 뺏는다.
 *   - WAITING_FOR_DEPOSIT: 가상계좌다. 입금까지 며칠이 정상이다.
 *   - DONE / CANCELED / …: 이미 끝난 것이라 여기서 손댈 일이 없다.
 */
export function isReleasableHold(paymentStatus: string | null): boolean {
  return paymentStatus === 'READY';
}

export interface PaymentHold {
  readonly status: string;
  readonly placedAt: Date;
  readonly paymentStatus: string | null;
  /**
   * PG 결제 키를 이미 받았는가.
   *
   * 키가 있다는 것은 **승인 절차가 시작됐다**는 뜻이다. 그 뒤에 우리 쪽
   * 기록이 실패했으면 돈은 나갔는데 주문은 대기로 남는다 — 사람이 대사할
   * 자리이지 배치가 지울 자리가 아니다.
   */
  readonly hasPaymentKey: boolean;
}

/**
 * 이 주문의 재고를 풀어도 되는가.
 *
 * 키를 아직 받지 않았다면 **승인을 부른 적이 없다는 뜻이고, 승인이 곧 청구다**
 * — 결제창에서 카드 정보를 넣었더라도 승인 전이면 돈이 나가지 않았다. 그래서
 * 여기서 푸는 것은 사용자에게서 산 것을 빼앗는 일이 아니다.
 */
export function isAbandonedHold(
  order: PaymentHold,
  now: Date,
  minutes = PAYMENT_HOLD_MINUTES,
): boolean {
  if (order.status !== 'PENDING') return false;
  if (!isReleasableHold(order.paymentStatus)) return false;
  if (order.hasPaymentKey) return false;
  return order.placedAt.getTime() < paymentHoldCutoff(now, minutes).getTime();
}
