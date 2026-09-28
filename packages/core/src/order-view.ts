import { isCancellableByCustomer, isRepayable, type OrderStatus } from './order-state';
import {
  awaitingDeposit, depositExpired, isPaidStatus,
  type PaymentMethodCode, type PaymentStatusCode,
} from './payment';
import { canCancelOwnReturn, canRequestReturn, isOpenReturn, type ReturnStatus } from './return-request';
import { canConfirmPurchase } from './reward';

/**
 * 주문 상세 화면이 무엇을 보여 줄지.
 *
 * **화면이 무엇을 세우고 무엇을 감추는지가 600줄짜리 컴포넌트 안에 흩어져 있었다.**
 * 판정 하나하나는 이미 core 의 순수 함수였는데, 그것들을 **어떻게 엮는지**는 화면에만
 * 있었다 — "언제 일부 취소 단추가 보이는가" 를 고치려면 JSX 사이를 뒤져야 했고, 그
 * 조합이 맞는지는 e2e 를 통째로 돌려야만 알 수 있었다.
 *
 * 엮는 규칙을 여기로 옮긴다. 화면은 이 결과를 그리기만 한다.
 *
 * **읽기(I/O)는 여기 없다.** 반품지·교환 옵션처럼 DB 를 물어야 하는 것은 화면이 맡는다.
 */

export interface OrderViewInput {
  readonly status: OrderStatus;
  readonly payment: {
    readonly method: PaymentMethodCode;
    readonly status: PaymentStatusCode;
    readonly virtualAccount: string | null;
    readonly virtualBank: string | null;
    readonly virtualDueDate: Date | null;
  } | null;
  /** 주문에 담긴 줄 수(취소된 것 포함) */
  readonly itemCount: number;
  /** 아직 살아 있는 줄 수 */
  readonly liveItemCount: number;
  readonly deliveredAt: Date | null;
  /** 가장 최근 반품·교환 신청의 상태. 없으면 null */
  readonly returnStatus: ReturnStatus | null;
  readonly now: Date;
  /** 결제 화면에서 실패해 넘어왔는가(`?payment=failed`) */
  readonly paymentFailed: boolean;
  /** 방금 구매확정을 눌렀는가(`?confirmed=1`) */
  readonly confirmedJustNow: boolean;
}

/** 큰 제목이 할 말. 화면이 이 값으로 문구를 고른다 — core 는 번역 열쇠를 모른다. */
export type OrderHeadline = 'unpaid' | 'placed' | 'closed' | 'default';

export interface OrderView {
  /** 결제를 다시 걸 수 있는가 */
  readonly repayable: boolean;
  /** 입금할 곳. 계좌가 없으면 null — 빈 칸이 늘어선 덩이는 "번호가 사라졌다" 로 읽힌다 */
  readonly deposit: {
    readonly bank: string | null;
    readonly account: string;
    readonly dueDate: Date | null;
  } | null;
  /** 입금 기한이 지났는가 */
  readonly depositExpired: boolean;
  readonly headline: OrderHeadline;
  /** 주문 전체를 취소할 수 있는가 */
  readonly canCancel: boolean;
  /** 일부 상품만 취소하는 자리를 열 수 있는가 */
  readonly canCancelItems: boolean;
  /** 반품·교환 신청 폼을 열 수 있는가 */
  readonly showReturnForm: boolean;
  /** 아직 끝나지 않은 신청이 있는가 */
  readonly openReturn: boolean;
  readonly canConfirmPurchase: boolean;
  /** 손님이 자기 반품·교환 신청을 무를 수 있는가 — 승인 전까지만이다 */
  readonly canCancelReturn: boolean;
  /** 방금 확정해서 단추가 사라졌는가 — 결과는 이 화면이 남긴다 */
  readonly justConfirmed: boolean;
  readonly paymentFailed: boolean;
}

export function orderView(input: OrderViewInput): OrderView {
  const pay = input.payment;
  const repayable = isRepayable(input.status, pay?.status ?? null);

  const deposit =
    pay && awaitingDeposit(pay.method, pay.status) && pay.virtualAccount
      ? { bank: pay.virtualBank, account: pay.virtualAccount, dueDate: pay.virtualDueDate }
      : null;

  const openReturn = input.returnStatus !== null && isOpenReturn(input.returnStatus);

  return {
    repayable,
    deposit,
    depositExpired: deposit !== null && depositExpired(deposit.dueDate),
    headline: headlineOf(input.status, repayable),
    canCancel: isCancellableByCustomer(input.status),
    /*
     * **일부 상품 취소를 열어 주는 조건.** 서버가 같은 조건으로 다시 막는다(cancel-items) —
     * 여기서는 눌러 봐야 거절될 단추를 세우지 않으려는 것뿐이다.
     *
     * 가상계좌는 뺀다. 입금 전에는 돌려줄 돈이 없고, 입금 뒤 부분 환불은 계좌를 받아야 한다.
     * 담긴 줄이 하나면 그건 주문 취소다.
     */
    canCancelItems:
      input.status === 'PAID' &&
      pay !== null &&
      isPaidStatus(pay.status) &&
      pay.method !== 'VIRTUAL_ACCOUNT' &&
      input.itemCount >= 2 &&
      input.liveItemCount >= 1,
    /**
     * 신청 버튼은 신청할 수 있을 때만.
     *
     * 반려된 뒤에는 다시 낼 수 있어야 한다 — 사유를 잘못 골랐을 수도 있고, 반려 사유를
     * 보고 보완할 수도 있다. `canRequestReturn` 이 상태로 판단하므로 반려로 배송중에
     * 돌아왔으면 자연히 다시 보인다.
     */
    showReturnForm: canRequestReturn({
      status: input.status,
      deliveredAt: input.deliveredAt,
      now: input.now,
    }),
    openReturn,
    canConfirmPurchase: canConfirmPurchase({ status: input.status, hasOpenReturn: openReturn }),
    canCancelReturn: input.returnStatus !== null && canCancelOwnReturn(input.returnStatus),
    justConfirmed: input.confirmedJustNow && input.status === 'CONFIRMED',
    paymentFailed: input.paymentFailed,
  };
}

/**
 * 이 화면은 주문 직후에도, 나중에 주문 내역에서 들어와도 열린다. 그래서 문구가 상태를
 * 따라가야 한다 — 배송중인 주문에 "결제가 확인되면 배송 준비를 시작합니다" 라고 적혀
 * 있으면 무슨 말인지 알 수 없다.
 *
 * **결제가 안 끝난 주문에 "접수되었습니다" 라고 쓰면 안 된다.** 아래에 "결제가 완료되지
 * 않았습니다" 를 붙여 놓고 큰 제목은 접수됐다고 말하면 둘 중 무엇을 믿어야 할지 알 수
 * 없다. 화면을 못 보는 사람에게는 더 나쁘다 — 경로 알림이 이 제목을 그대로 읽어 준다.
 */
function headlineOf(status: OrderStatus, repayable: boolean): OrderHeadline {
  if (repayable) return 'unpaid';
  if (status === 'PENDING') return 'placed';
  if (status === 'CANCELLED' || status === 'REFUNDED') return 'closed';
  return 'default';
}
