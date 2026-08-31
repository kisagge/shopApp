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
      return Promise.resolve({
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
