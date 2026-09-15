import { describe, it, expect } from 'vitest';
import {
  rewardExpiresAt, isAutoConfirmable, rewardToGrant,
  REWARD_VALID_DAYS, AUTO_CONFIRM_DAYS,
} from '../src/reward';
import { returnWindowDays } from '../src/return-request';

const DAY = 24 * 60 * 60 * 1000;
const delivered = new Date('2026-09-01T10:00:00+09:00');

describe('적립 유효기간', () => {
  it('지급일로부터 1년', () => {
    const at = new Date('2026-09-01T00:00:00+09:00');
    expect(rewardExpiresAt(at).getTime() - at.getTime()).toBe(REWARD_VALID_DAYS * DAY);
  });
});

describe('자동 구매확정', () => {
  const base = { status: 'DELIVERED', deliveredAt: delivered, hasOpenReturn: false };

  it('기한이 지나면 확정한다 — 대부분은 확정 버튼을 누르지 않는다', () => {
    expect(isAutoConfirmable({ ...base, now: new Date(delivered.getTime() + 9 * DAY) })).toBe(true);
  });

  it('기한 전에는 확정하지 않는다', () => {
    expect(isAutoConfirmable({ ...base, now: new Date(delivered.getTime() + 3 * DAY) })).toBe(false);
  });

  it('반품 신청이 걸려 있으면 확정하지 않는다 — 확정은 되돌릴 수 없다', () => {
    expect(
      isAutoConfirmable({
        ...base, hasOpenReturn: true, now: new Date(delivered.getTime() + 30 * DAY),
      }),
    ).toBe(false);
  });

  it('배송완료가 아니면 대상이 아니다', () => {
    for (const status of ['SHIPPED', 'PREPARING', 'CONFIRMED', 'RETURN_REQUESTED']) {
      expect(
        isAutoConfirmable({ ...base, status, now: new Date(delivered.getTime() + 30 * DAY) }),
      ).toBe(false);
    }
  });

  it('배송완료 시각을 모르면 셀 수 없다', () => {
    expect(
      isAutoConfirmable({ ...base, deliveredAt: null, now: new Date('2027-01-01') }),
    ).toBe(false);
  });

  it('단순 변심 반품 기한보다 길다 — 기한이 남았는데 먼저 확정되면 안 된다', () => {
    expect(AUTO_CONFIRM_DAYS).toBeGreaterThan(returnWindowDays('CHANGED_MIND'));
  });
});

describe('지급액', () => {
  it('주문에 저장해 둔 값을 쓴다 — 약속한 값이다', () => {
    expect(rewardToGrant(2890)).toBe(2890);
  });

  it('0 이하면 지급하지 않는다 — 내역만 어지럽힌다', () => {
    expect(rewardToGrant(0)).toBe(0);
    expect(rewardToGrant(-100)).toBe(0);
  });
});

describe('canConfirmPurchase — 손님이 직접 확정', () => {
  it('배송완료이고 처리 전 반품이 없으면 기한을 기다리지 않고 확정할 수 있다', async () => {
    const { canConfirmPurchase } = await import('../src');
    expect(canConfirmPurchase({ status: 'DELIVERED', hasOpenReturn: false })).toBe(true);
    expect(canConfirmPurchase({ status: 'DELIVERED', hasOpenReturn: true })).toBe(false);
    for (const status of ['SHIPPED', 'CONFIRMED', 'RETURN_REQUESTED', 'PAID']) {
      expect(canConfirmPurchase({ status, hasOpenReturn: false }), status).toBe(false);
    }
  });
});
