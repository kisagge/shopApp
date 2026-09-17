import type { Won } from './money';
// 타입만 서로 가져온다 — 실행 시점의 순환은 없다
import type { OrderStatus } from './order-state';

/**
 * 결제 게이트웨이 경계.
 *
 * PG 를 갈아 끼울 수 있게 인터페이스로 두지만, 진짜 이유는 **테스트다**.
 * 주문 확정·취소 로직을 검증하려고 매번 외부 API 를 부를 수는 없다.
 * 로컬과 CI 는 MockGateway 로 돌고 프로덕션만 실제 PG 를 쓴다.
 *
 * 상태값은 토스페이먼츠 것을 그대로 쓴다. 우리 말로 번역하면 웹훅을 대조할
 * 때마다 매핑 표를 봐야 하고, 그 표가 곧 버그가 숨는 자리가 된다.
 */

export const PAYMENT_METHOD_CODE = ['CARD', 'TRANSFER', 'VIRTUAL_ACCOUNT', 'EASY_PAY'] as const;
export type PaymentMethodCode = (typeof PAYMENT_METHOD_CODE)[number];

export const PAYMENT_STATUS_CODE = [
  'READY',
  'IN_PROGRESS',
  'WAITING_FOR_DEPOSIT',
  'DONE',
  'CANCELED',
  'PARTIAL_CANCELED',
  'ABORTED',
  'EXPIRED',
  'FAILED',
] as const;
export type PaymentStatusCode = (typeof PAYMENT_STATUS_CODE)[number];

export const PAYMENT_STATUS_LABEL: Readonly<Record<PaymentStatusCode, string>> = {
  READY: '결제 대기',
  IN_PROGRESS: '결제 진행 중',
  WAITING_FOR_DEPOSIT: '입금 대기',
  DONE: '결제 완료',
  CANCELED: '결제 취소',
  PARTIAL_CANCELED: '부분 취소',
  ABORTED: '결제 중단',
  EXPIRED: '기한 만료',
  FAILED: '결제 실패',
};

/** 이 상태들은 돈이 실제로 들어왔다는 뜻이다 */
export const isPaidStatus = (status: PaymentStatusCode): boolean =>
  status === 'DONE' || status === 'PARTIAL_CANCELED';

export interface VirtualAccountInfo {
  readonly bank: string;
  readonly accountNumber: string;
  readonly dueDate: Date | null;
}

export interface PaymentResult {
  readonly paymentKey: string;
  readonly approvalNo: string | null;
  readonly method: PaymentMethodCode;
  readonly status: PaymentStatusCode;
  readonly amount: Won;
  readonly approvedAt: Date | null;
  readonly virtualAccount: VirtualAccountInfo | null;
  /** PG 응답 원문. 대사와 장애 분석에 필요하다. */
  readonly raw: unknown;
}

export interface PaymentConfirmRequest {
  readonly paymentKey: string;
  readonly orderNo: string;
  /** 주문에 저장된 금액. **요청으로 받은 값을 그대로 넘기면 안 된다.** */
  readonly amount: Won;
}

export interface PaymentCancelRequest {
  readonly paymentKey: string;
  /** null 이면 전액 취소 */
  readonly amount: Won | null;
  readonly reason: string;
  /**
   * 같은 취소를 두 번 보내도 한 번만 처리되게 하는 키.
   * 네트워크가 끊겨 재시도할 때 두 번 환불되는 걸 막는다.
   */
  readonly idempotencyKey: string;
}

export interface PaymentGateway {
  readonly provider: string;
  confirm(request: PaymentConfirmRequest): Promise<PaymentResult>;
  cancel(request: PaymentCancelRequest): Promise<PaymentResult>;
  /**
   * 결제 하나를 PG 에 다시 물어본다.
   *
   * 웹훅 때문에 필요하다. **웹훅 본문을 믿고 상태를 바꾸면 안 된다** —
   * 우리 엔드포인트 주소만 알면 누구나 "입금됐다" 고 보낼 수 있고, 그러면
   * 돈을 받지 않고 주문이 결제 완료가 된다. 웹훅은 "뭔가 바뀌었으니 가서
   * 확인해라" 는 신호로만 쓰고, 진실은 여기서 가져온다.
   */
  inquire(paymentKey: string): Promise<PaymentResult>;
}

export class PaymentError extends Error {
  constructor(
    readonly code: string,
    message: string,
    /** 일시적 장애라 다시 시도해도 되는가 */
    readonly retryable = false,
    readonly raw: unknown = null,
  ) {
    super(message);
    this.name = 'PaymentError';
  }
}

/**
 * 결제 금액이 주문 금액과 같은지 확인한다.
 *
 * 클라이언트가 보낸 금액으로 승인하면 1원짜리 결제로 10만원 주문을 통과시킬 수
 * 있다. **주문에 저장된 금액과 정확히 일치할 때만** 승인을 진행한다.
 */
export function assertPaymentAmount(expected: Won, received: number): void {
  if (expected !== received) {
    throw new PaymentError(
      'AMOUNT_MISMATCH',
      `결제 금액이 주문 금액과 다릅니다. 주문 ${expected}원, 요청 ${received}원`,
    );
  }
}

/**
 * 입금할 곳을 보여 줘야 하는 주문인가.
 *
 * **계좌를 받아 두고 보여 주지 않고 있었다.** 가상계좌 셋(은행·계좌번호·기한)을 결제
 * 때 저장하는데 읽는 곳이 어디에도 없었다 — 주문 화면은 "결제가 확인되면 배송 준비를
 * 시작합니다" 만 말했다. 번호를 볼 수 있는 곳은 결제 직후 한 번 뜨는 응답과 메일뿐이라,
 * 탭을 닫았거나 메일이 스팸함에 갔으면 **그 주문은 화면에서 입금할 방법이 없었다.**
 *
 * **재결제와는 다른 자리다.** isRepayable 이 입금 대기를 빼는 것은 맞다 — 그때 할 일은
 * 송금이지 재결제가 아니고, 다시 걸면 이미 받은 계좌를 버리게 된다. 다만 "재결제가
 * 아니다" 가 "아무 말도 안 한다" 가 되어 있었다.
 *
 * 기한이 지난 것도 보여 준다. 만료됐다는 사실 자체가 알아야 할 소식이고, 그때 할 일
 * (다시 주문하거나 취소)을 화면이 안내할 수 있다.
 */
export const awaitingDeposit = (
  method: PaymentMethodCode | null,
  status: PaymentStatusCode | null,
): boolean =>
  method === 'VIRTUAL_ACCOUNT' && (status === 'WAITING_FOR_DEPOSIT' || status === 'EXPIRED');

/** 입금 기한이 지났는가. 기한이 없으면 지나지 않은 것으로 본다 */
export const depositExpired = (dueDate: Date | null, now: Date = new Date()): boolean =>
  dueDate !== null && dueDate.getTime() <= now.getTime();

/**
 * 가상계좌 입금 신호가 왔을 때 무엇을 할까.
 *
 * · `APPLY` — 결제 대기 주문이다. 결제완료로 옮긴다.
 * · `LATE`  — 이미 결제 대기가 아니다(대개 손님이 취소했다). **받은 돈을 남기고 사람에게 넘긴다.**
 *
 * 한동안 LATE 를 가리지 않고 "결제완료로 옮기기" 를 계산하다 상태머신이 던졌다(취소 → 결제완료는
 * 없는 길이다). 웹훅은 500 을 받고 끝없이 재시도했고, 받은 돈은 아무 데도 적히지 않았다. 입금 뒤의
 * 환불은 손님의 환불 계좌가 있어야 해서(PG 규칙) 여기서 자동으로 돌려줄 수도 없다.
 */
export type DepositDecision = 'APPLY' | 'LATE';

export const depositDecision = (orderStatus: OrderStatus): DepositDecision =>
  orderStatus === 'PENDING' ? 'APPLY' : 'LATE';

/**
 * 주문을 취소할 때 PG 에서 가상계좌를 닫아야 하는가.
 *
 * **입금 전이면 닫는다.** 닫지 않으면 계좌가 살아 있어 취소한 뒤에도 입금이 들어온다. 입금 전 취소는
 * 돌려줄 돈이 없어 환불 계좌가 필요 없고, 전액 취소만 된다(PG 문서).
 */
export const mustCloseVirtualAccount = (paymentStatus: PaymentStatusCode | null): boolean =>
  paymentStatus === 'WAITING_FOR_DEPOSIT';
