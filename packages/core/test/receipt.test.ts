import { describe, it, expect } from 'vitest';
import { receiptTotals, isReceiptIssuable } from '../src';

/** 영수증 금액 — 결제는 결제대로, 돌려준 것은 따로, 끝에 실제로 낸 돈 */
describe('receiptTotals', () => {
  it('돌려준 것이 없으면 낸 돈이 곧 결제 금액이다', () => {
    expect(receiptTotals(52_000, [])).toEqual({
      paid: 52_000, refundedCash: 0, refundedPoints: 0, shippingDeducted: 0, net: 52_000,
    });
  });

  it('일부 취소가 여러 번이면 모두 더하고, 결제 금액은 줄이지 않는다', () => {
    const totals = receiptTotals(80_000, [
      { amount: 20_000, points: 500, shippingDeducted: 3_000 },
      { amount: 10_000, points: 0, shippingDeducted: 0 },
    ]);
    expect(totals.paid).toBe(80_000);
    expect(totals.refundedCash).toBe(30_000);
    expect(totals.refundedPoints).toBe(500);
    expect(totals.shippingDeducted).toBe(3_000);
    expect(totals.net).toBe(50_000);
  });

  it('포인트만 돌려받았으면 낸 돈은 그대로다 — 포인트는 현금이 아니다', () => {
    expect(receiptTotals(10_000, [{ amount: 0, points: 2_000, shippingDeducted: 0 }]).net).toBe(10_000);
  });

  it('돌려준 돈이 결제보다 크면 감추지 않고 음수로 드러낸다', () => {
    expect(receiptTotals(10_000, [{ amount: 12_000, points: 0, shippingDeducted: 0 }]).net).toBe(-2_000);
  });
});

describe('isReceiptIssuable', () => {
  it('결제된 적이 있는 주문만 — 결제대기 주문의 영수증은 내지 않은 돈의 증빙이 된다', () => {
    expect(isReceiptIssuable({ paidAt: null })).toBe(false);
    expect(isReceiptIssuable({ paidAt: new Date() })).toBe(true);
  });
});
