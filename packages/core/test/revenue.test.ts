import { describe, it, expect } from 'vitest';
import {
  REFUND_STATUS,
  SETTLEMENT_SALE_STATUS,
  isRefundStatus,
  deductibleFromSettlement,
  statusesAfterSettlementSale,
  netRevenue,
  ORDER_STATUS,
  nextStatuses,
  type OrderStatus,
} from '../src';

describe('환불 상태', () => {
  it('반품 접수는 환불이 아니다 — 돈은 아직 우리 쪽에 있다', () => {
    expect(isRefundStatus('RETURN_REQUESTED')).toBe(false);
    expect(isRefundStatus('RETURNED')).toBe(false);
    expect(isRefundStatus('REFUNDED')).toBe(true);
    expect(isRefundStatus('CANCELLED')).toBe(true);
  });

  it('돈이 오간 적 없는 상태는 환불도 아니다', () => {
    expect(isRefundStatus('PENDING')).toBe(false);
  });
});

describe('정산 차감', () => {
  /**
   * 차감 규칙(`confirmedAt !== null`)이 옳은 이유가 여기 있다. 구매확정이
   * 종착이 아니게 되면 확정된 주문도 환불될 수 있고, 그때는 **차감이 실제로
   * 일어나야 한다.** 이 검사는 그 변화를 알아채라고 있는 것이지, 종착임을
   * 영원히 못 박으려는 것이 아니다.
   */
  it('구매확정은 종착이다 — 확정된 주문은 환불될 수 없다', () => {
    expect(statusesAfterSettlementSale()).toEqual([]);
  });

  it('지급된 적 없는 주문은 빼지 않는다 — 가맹점이 받은 적 없는 돈을 토해낸다', () => {
    expect(deductibleFromSettlement({ status: 'REFUNDED', confirmedAt: null })).toBe(false);
    expect(deductibleFromSettlement({ status: 'CANCELLED', confirmedAt: null })).toBe(false);
  });

  it('지급된 적 있는 주문이 환불되면 뺀다', () => {
    expect(deductibleFromSettlement({ status: 'REFUNDED', confirmedAt: new Date() })).toBe(true);
  });

  it('환불이 아닌 상태는 무엇이든 빼지 않는다', () => {
    const notRefund = ORDER_STATUS.filter((s) => !isRefundStatus(s));
    for (const status of notRefund) {
      expect(deductibleFromSettlement({ status, confirmedAt: new Date() }), status).toBe(false);
    }
  });

  /** 정산 매출로 잡는 상태가 환불 상태 목록에 섞이면 같은 돈을 더하고 뺀다. */
  it('정산 매출 상태와 환불 상태는 겹치지 않는다', () => {
    expect(REFUND_STATUS).not.toContain(SETTLEMENT_SALE_STATUS);
  });
});

describe('순매출', () => {
  it('총매출 · 환불 · 순매출을 함께 돌려준다 — 하나만 두면 대조가 안 된다', () => {
    expect(netRevenue(1_000_000, 120_000)).toEqual({
      gross: 1_000_000,
      refunded: 120_000,
      net: 880_000,
    });
  });

  it('환불이 매출보다 클 수 있다 — 지난 기간에 판 것이 이번에 환불되면', () => {
    expect(netRevenue(0, 50_000).net).toBe(-50_000);
  });
});

describe('반품 접수는 매출을 흔들지 않는다', () => {
  /**
   * 예전 결함을 그대로 못 박는다. 반품 접수는 되돌릴 수 있는 상태이고
   * (RETURN_REQUESTED → SHIPPED), 그 왕복이 매출을 오르내리게 하면 안 된다.
   */
  it('반품 접수는 철회할 수 있다 — 되돌릴 수 있는 것으로 돈을 세면 안 된다', () => {
    const back = nextStatuses('RETURN_REQUESTED');
    expect(back).toContain('SHIPPED');
    for (const status of ['RETURN_REQUESTED', ...back] as OrderStatus[]) {
      if (status === 'RETURNED') continue; // 반품완료는 환불 직전 단계
      expect(isRefundStatus(status), status).toBe(false);
    }
  });
});
