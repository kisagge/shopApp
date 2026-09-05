import { describe, it, expect } from 'vitest';
import {
  isAbandonedHold, isReleasableHold, paymentHoldCutoff, PAYMENT_HOLD_MINUTES,
} from '../src/order-hold';

const NOW = new Date('2026-09-05T12:00:00Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60 * 1000);

const hold = (over: Partial<Parameters<typeof isAbandonedHold>[0]> = {}) => ({
  status: 'PENDING',
  placedAt: minutesAgo(PAYMENT_HOLD_MINUTES + 1),
  paymentStatus: 'READY',
  hasPaymentKey: false,
  ...over,
});

describe('재고를 풀어도 되는가', () => {
  it('기한이 지난 결제 대기 주문은 푼다', () => {
    expect(isAbandonedHold(hold(), NOW)).toBe(true);
  });

  it('기한 안이면 두고 본다 — 느리게 결제하는 사람의 주문을 뺏지 않는다', () => {
    expect(isAbandonedHold(hold({ placedAt: minutesAgo(PAYMENT_HOLD_MINUTES - 1) }), NOW)).toBe(
      false,
    );
  });

  it('경계는 지난 뒤부터다', () => {
    const exactly = paymentHoldCutoff(NOW);
    expect(isAbandonedHold(hold({ placedAt: exactly }), NOW)).toBe(false);
    expect(isAbandonedHold(hold({ placedAt: new Date(exactly.getTime() - 1) }), NOW)).toBe(true);
  });

  it.each(['PAID', 'CANCELLED', 'DELIVERED', 'CONFIRMED'])(
    '%s 주문은 손대지 않는다',
    (status) => {
      expect(isAbandonedHold(hold({ status }), NOW)).toBe(false);
    },
  );

  it('가상계좌는 절대 풀지 않는다 — 입금까지 며칠이 정상이다', () => {
    expect(isAbandonedHold(hold({ paymentStatus: 'WAITING_FOR_DEPOSIT' }), NOW)).toBe(false);
  });

  it('승인이 오가는 중이면 풀지 않는다 — 승인된 주문의 재고를 뺏는다', () => {
    expect(isAbandonedHold(hold({ paymentStatus: 'IN_PROGRESS' }), NOW)).toBe(false);
  });

  it.each(['DONE', 'CANCELED', 'PARTIAL_CANCELED', 'ABORTED', 'EXPIRED', 'FAILED', null])(
    '결제 상태가 %s 면 배치가 손대지 않는다',
    (paymentStatus) => {
      expect(isReleasableHold(paymentStatus)).toBe(false);
      expect(isAbandonedHold(hold({ paymentStatus }), NOW)).toBe(false);
    },
  );

  it('PG 키를 이미 받았으면 사람이 봐야 한다 — 돈이 나갔을 수 있다', () => {
    expect(isAbandonedHold(hold({ hasPaymentKey: true }), NOW)).toBe(false);
  });

  it('기한을 바꿔 부를 수 있다', () => {
    const tenMinutesAgo = hold({ placedAt: minutesAgo(10) });
    expect(isAbandonedHold(tenMinutesAgo, NOW, 30)).toBe(false);
    expect(isAbandonedHold(tenMinutesAgo, NOW, 5)).toBe(true);
  });
});
