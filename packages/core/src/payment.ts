import type { Won } from './money';

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
