import { describe, it, expect } from 'vitest';
import { checkPointAdjust, pointAdjustEntry, REWARD_VALID_DAYS } from '../src';

describe('checkPointAdjust', () => {
  it('지급은 잔액과 상관없다', () => {
    expect(checkPointAdjust({ direction: 'GRANT', amount: 5_000, balance: 0, closed: false })).toBeNull();
  });

  it('차감은 잔액까지만 — 넘으면 막는다', () => {
    expect(checkPointAdjust({ direction: 'DEDUCT', amount: 1_000, balance: 1_000, closed: false })).toBeNull();
    expect(checkPointAdjust({ direction: 'DEDUCT', amount: 1_001, balance: 1_000, closed: false })).toBe('INSUFFICIENT_POINTS');
  });

  it('탈퇴한 계정에는 둘 다 못 한다', () => {
    expect(checkPointAdjust({ direction: 'GRANT', amount: 1, balance: 0, closed: true })).toBe('USER_CLOSED');
    expect(checkPointAdjust({ direction: 'DEDUCT', amount: 1, balance: 10, closed: true })).toBe('USER_CLOSED');
  });
});

describe('pointAdjustEntry', () => {
  const now = new Date('2026-09-15T00:00:00Z');

  it('지급은 양수에 적립과 같은 유효기간', () => {
    const entry = pointAdjustEntry('GRANT', 3_000, now);
    expect(entry.amount).toBe(3_000);
    expect(entry.expiresAt!.getTime() - now.getTime()).toBe(REWARD_VALID_DAYS * 24 * 60 * 60 * 1000);
  });

  it('차감은 음수에 기한 없음', () => {
    expect(pointAdjustEntry('DEDUCT', 3_000, now)).toEqual({ amount: -3_000, expiresAt: null });
  });
});
