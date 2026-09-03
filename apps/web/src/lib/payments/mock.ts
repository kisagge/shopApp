import { won, PaymentError, type PaymentGateway, type PaymentResult } from '@shop/core';

/**
 * 로컬·CI 용 가짜 PG.
 *
 * 주문 확정과 취소 로직을 검증하려고 매번 외부 API 를 부를 수는 없다.
 * 실패 경로도 재현할 수 있어야 하므로 paymentKey 접두사로 시나리오를 고른다.
 *   mock_fail_*    → 승인 실패
 *   mock_timeout_* → 네트워크 오류(재시도 가능)
 *   mock_va_*      → 가상계좌(입금 대기)
 */
export function createMockGateway(): PaymentGateway {
  /**
   * 이 가짜 PG 가 승인한 결제들.
   *
   * inquire 가 있어야 가상계좌 입금 웹훅을 로컬에서 재현할 수 있는데,
   * 아무 값이나 돌려주면 금액 검증에 걸려 **성공 경로를 아예 못 밟는다.**
   * 자기가 승인한 금액을 기억했다가 그대로 답한다.
   *
   * 프로세스 안에만 있으므로 서버를 재시작하면 사라진다. 로컬·CI 전용이라
   * 그것으로 충분하다 — 실제 PG 는 자기 DB 를 본다.
   */
  const approved = new Map<string, PaymentResult>();

  return {
    provider: 'mock',

    confirm({ paymentKey, orderNo, amount }): Promise<PaymentResult> {
      if (paymentKey.startsWith('mock_fail')) {
        return Promise.reject(
          new PaymentError('REJECT_CARD_COMPANY', '카드사에서 거절했습니다.', false),
        );
      }
      if (paymentKey.startsWith('mock_timeout')) {
        return Promise.reject(
          new PaymentError('NETWORK_ERROR', 'PG 에 연결하지 못했습니다.', true),
        );
      }

      const isVirtual = paymentKey.startsWith('mock_va');
      const result: PaymentResult = {
        paymentKey,
        approvalNo: isVirtual ? null : `MOCK${orderNo.slice(-8)}`,
        method: isVirtual ? 'VIRTUAL_ACCOUNT' : 'CARD',
        status: isVirtual ? 'WAITING_FOR_DEPOSIT' : 'DONE',
        amount: won(amount),
        approvedAt: isVirtual ? null : new Date(),
        virtualAccount: isVirtual
          ? {
              bank: '기업은행',
              accountNumber: `0000${orderNo.slice(-8)}`,
              dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
            }
          : null,
        raw: { mock: true, orderNo },
      };
      approved.set(paymentKey, result);
      return Promise.resolve(result);
    },

    /**
     * 조회. 가상계좌 입금 웹훅을 로컬에서 재현하려고 둔다.
     *
     * 승인한 적 있는 키면 **그때 금액 그대로** 입금 완료로 답한다. 그래야
     * 입금 반영의 성공 경로를 밟아 볼 수 있다. 승인한 적 없는 키는
     * 실패로 답한다 — 모르는 결제를 아는 척하면 안 된다.
     */
    inquire(paymentKey): Promise<PaymentResult> {
      const seen = approved.get(paymentKey);
      if (!seen) {
        return Promise.resolve({
          paymentKey, approvalNo: null, method: 'CARD', status: 'FAILED',
          amount: won(0), approvedAt: null, virtualAccount: null,
          raw: { mock: true, unknown: true },
        });
      }
      return Promise.resolve({
        ...seen,
        status: 'DONE',
        approvedAt: seen.approvedAt ?? new Date(),
        raw: { mock: true, inquired: true },
      });
    },

    cancel({ paymentKey, amount }): Promise<PaymentResult> {
      return Promise.resolve({
        paymentKey,
        approvalNo: null,
        method: 'CARD',
        status: amount === null ? 'CANCELED' : 'PARTIAL_CANCELED',
        amount: won(amount ?? 0),
        approvedAt: null,
        virtualAccount: null,
        raw: { mock: true, canceled: true },
      });
    },
  };
}
