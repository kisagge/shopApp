import { describe, it, expect } from 'vitest';
import {
  settlementPeriod, isClosedPeriod, previousYearMonth,
  calculateSettlement, isRecalculable, SettlementError,
} from '../src/settlement';
import { won } from '../src/money';

describe('정산 기간 — KST 경계', () => {
  it('8월은 8월 1일 00:00 KST 부터 9월 1일 00:00 KST 직전까지다', () => {
    const p = settlementPeriod('2026-08');
    // KST 자정 = 전날 UTC 15:00
    expect(p.start.toISOString()).toBe('2026-07-31T15:00:00.000Z');
    expect(p.end.toISOString()).toBe('2026-08-31T15:00:00.000Z');
  });

  it('12월은 해를 넘긴다', () => {
    const p = settlementPeriod('2026-12');
    expect(p.end.toISOString()).toBe('2026-12-31T15:00:00.000Z');
  });

  it('9월 1일 오전 8시 KST 확정 건은 8월에 들어가지 않는다', () => {
    // UTC 기준으로 경계를 잡았다면 이 건이 8월로 새어 들어간다
    const p = settlementPeriod('2026-08');
    const kstSep1_08 = new Date('2026-08-31T23:00:00.000Z'); // 9/1 08:00 KST
    expect(kstSep1_08.getTime() >= p.end.getTime()).toBe(true);
  });

  it('8월 31일 밤 11시 KST 확정 건은 8월에 들어간다', () => {
    const p = settlementPeriod('2026-08');
    const kstAug31_23 = new Date('2026-08-31T14:00:00.000Z');
    expect(kstAug31_23.getTime() < p.end.getTime()).toBe(true);
    expect(kstAug31_23.getTime() >= p.start.getTime()).toBe(true);
  });

  it.each(['2026-13', '2026-00', '202608', '2026-8', 'x'])('%s 는 거절한다', (bad) => {
    expect(() => settlementPeriod(bad)).toThrow(SettlementError);
  });
});

describe('기간 종료 판정', () => {
  it('진행 중인 달은 확정할 수 없다', () => {
    const p = settlementPeriod('2026-08');
    expect(isClosedPeriod(p, new Date('2026-08-20T00:00:00Z'))).toBe(false);
  });

  it('끝난 달은 확정할 수 있다', () => {
    const p = settlementPeriod('2026-08');
    expect(isClosedPeriod(p, new Date('2026-09-01T00:00:00Z'))).toBe(true);
  });

  it('경계 시각 정각에는 이미 끝난 것으로 본다', () => {
    const p = settlementPeriod('2026-08');
    expect(isClosedPeriod(p, p.end)).toBe(true);
  });
});

describe('앞 달 계산', () => {
  it('9월 중이면 8월이다', () => {
    expect(previousYearMonth(new Date('2026-09-15T00:00:00Z'))).toBe('2026-08');
  });

  it('1월 중이면 앞해 12월이다', () => {
    expect(previousYearMonth(new Date('2026-01-15T00:00:00Z'))).toBe('2025-12');
  });

  it('KST 로 해가 바뀐 직후를 앞해 12월로 본다', () => {
    // 2026-01-01 08:00 KST = 2025-12-31 23:00 UTC
    expect(previousYearMonth(new Date('2025-12-31T23:00:00Z'))).toBe('2025-12');
  });
});

describe('지급액 계산', () => {
  it('수수료는 내림한다 — 가맹점에게 유리한 쪽', () => {
    const r = calculateSettlement({ gross: won(1_000_001), commissionPercent: 15, refund: won(0) });
    expect(r.commissionAmount).toBe(150_000); // 150,000.15 → 150,000
    expect(r.netAmount).toBe(850_001);
  });

  it('환불은 수수료를 뗀 뒤에 빠진다 — 환불분 수수료는 플랫폼이 돌려준다', () => {
    const r = calculateSettlement({ gross: won(1_000_000), commissionPercent: 10, refund: won(200_000) });
    expect(r.commissionAmount).toBe(100_000);
    expect(r.netAmount).toBe(700_000);
  });

  it('환불이 매출을 넘으면 음수로 남긴다 — 0 으로 막으면 채무가 사라진다', () => {
    const r = calculateSettlement({ gross: won(100_000), commissionPercent: 10, refund: won(300_000) });
    expect(r.netAmount).toBe(-210_000);
  });

  it('매출이 없으면 전부 0 이다', () => {
    const r = calculateSettlement({ gross: won(0), commissionPercent: 15, refund: won(0) });
    expect(r.netAmount).toBe(0);
  });

  it('수수료율 0% 면 전액 지급이다', () => {
    const r = calculateSettlement({ gross: won(500_000), commissionPercent: 0, refund: won(0) });
    expect(r.netAmount).toBe(500_000);
  });

  it.each([-1, 101, 15.5])('수수료율 %s 는 거절한다', (bad) => {
    expect(() =>
      calculateSettlement({ gross: won(1000), commissionPercent: bad, refund: won(0) }),
    ).toThrow(SettlementError);
  });
});

describe('재집계 가능 여부', () => {
  it('확정·지급된 것은 다시 집계하지 않는다', () => {
    expect(isRecalculable('CONFIRMED')).toBe(false);
    expect(isRecalculable('PAID')).toBe(false);
  });

  it('집계 중이거나 보류인 것만 다시 계산한다', () => {
    expect(isRecalculable('PENDING')).toBe(true);
    expect(isRecalculable('HELD')).toBe(true);
  });
});
