import { describe, it, expect } from 'vitest';
import {
  canEditCommission, commissionAppliesFrom, isCommissionPercent,
  COMMISSION_MAX_PERCENT, COMMISSION_MIN_PERCENT, type Actor,
} from '../src';

/**
 * 수수료율.
 *
 * 스키마에는 칸이 있었는데 바꿀 길이 시드밖에 없었다 — 조건을 새로 협의해도 코드를 고쳐 다시 시드해야 했다.
 */

const superAdmin: Actor = { id: 'u-s', role: 'SUPER_ADMIN', merchantId: null };
const admin: Actor = { id: 'u-a', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };

describe('받을 수 있는 요율', () => {
  it('0 부터 50 까지의 정수다', () => {
    expect(isCommissionPercent(COMMISSION_MIN_PERCENT)).toBe(true);
    expect(isCommissionPercent(COMMISSION_MAX_PERCENT)).toBe(true);
    expect(isCommissionPercent(15)).toBe(true);
  });

  it('0 을 받는다 — 입점 초기에 수수료를 안 받는 조건이 실제로 있다', () => {
    expect(isCommissionPercent(0)).toBe(true);
  });

  it('절반을 넘으면 받지 않는다 — 0 하나를 더 눌러 5%가 50%가 되는 실수가 여기서 걸린다', () => {
    expect(isCommissionPercent(51)).toBe(false);
    expect(isCommissionPercent(100)).toBe(false);
  });

  it('음수와 소수는 받지 않는다', () => {
    expect(isCommissionPercent(-1)).toBe(false);
    expect(isCommissionPercent(12.5)).toBe(false);
  });

  it('숫자가 아니면 받지 않는다', () => {
    expect(isCommissionPercent('15')).toBe(false);
    expect(isCommissionPercent(null)).toBe(false);
  });
});

describe('누가 바꾸는가', () => {
  it('입점을 승인하는 사람이 조건도 정한다 — 슈퍼관리자', () => {
    expect(canEditCommission(superAdmin)).toBe(true);
  });

  it('관리자는 못 바꾼다 — 요율을 내리고 지급까지 집행하는 길을 한 사람이 완결하면 안 된다', () => {
    expect(canEditCommission(admin)).toBe(false);
  });

  it('가맹점은 당연히 못 바꾼다 — 자기 몫을 자기가 정하는 것이 된다', () => {
    expect(canEditCommission(merchant)).toBe(false);
  });
});

describe('언제부터 적용되는가', () => {
  it('바꾼 그달부터다 — 아직 확정하지 않은 기간이 그것이다', () => {
    expect(commissionAppliesFrom(new Date('2026-09-16T05:00:00Z'))).toBe('2026-09');
  });

  it('한국 시각으로 센다 — UTC 로 세면 월말 밤에 지난달로 적힌다', () => {
    // 2026-09-30 23:00 KST = 2026-09-30 14:00 UTC
    expect(commissionAppliesFrom(new Date('2026-09-30T14:00:00Z'))).toBe('2026-09');
    // 2026-10-01 00:30 KST = 2026-09-30 15:30 UTC
    expect(commissionAppliesFrom(new Date('2026-09-30T15:30:00Z'))).toBe('2026-10');
  });
});
