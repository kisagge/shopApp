import { describe, it, expect } from 'vitest';
import {
  settlementPeriod, isClosedPeriod, previousYearMonth, yearMonthOf, settlementWorthTelling,
  calculateSettlement, isRecalculable, SettlementError, isCarryable, isPayable, settlementHoldTarget,
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

describe('그 시각이 속한 달', () => {
  it('정산 행의 시작 시각을 그 달 이름으로 되읽는다', () => {
    /*
     * 정산 행은 기간의 시작 시각만 들고 다닌다. 8월 정산의 시작은 7월 31일
     * 15:00 UTC 라서, UTC 로 읽으면 알림이 "2026-07 정산" 이라고 말한다.
     */
    expect(yearMonthOf(settlementPeriod('2026-08').start)).toBe('2026-08');
  });

  it('해가 바뀌는 자리도 KST 로 읽는다', () => {
    expect(yearMonthOf(settlementPeriod('2026-01').start)).toBe('2026-01');
  });

  it('달의 마지막 순간은 아직 그 달이다', () => {
    const august = settlementPeriod('2026-08');
    expect(yearMonthOf(new Date(august.end.getTime() - 1))).toBe('2026-08');
    expect(yearMonthOf(august.end)).toBe('2026-09');
  });
});

describe('마감을 알릴 만한가', () => {
  it('판 것이 있으면 알린다', () => {
    expect(settlementWorthTelling({ grossAmount: won(413_000), refundAmount: won(0) })).toBe(true);
  });

  it('오간 것이 없는 달은 알리지 않는다 — 장부에는 남지만 할 말은 아니다', () => {
    /*
     * 마감은 쉬고 있는 가맹점에도 0원짜리 한 줄을 쓴다(내려받은 정산 파일의 합이
     * 맞아야 한다). 그 줄마다 알림을 보내면 알림함이 매달 0원으로 채워져서,
     * 정작 돈이 오간 달의 알림까지 함께 지나친다.
     */
    expect(settlementWorthTelling({ grossAmount: won(0), refundAmount: won(0) })).toBe(false);
  });

  it('환불만 있어 지급액이 음수인 달은 알린다', () => {
    // 오간 것이 없어서 0원인 것과, 물러난 돈이 있어서 마이너스인 것은 전혀 다른 소식이다
    expect(settlementWorthTelling({ grossAmount: won(0), refundAmount: won(90_000) })).toBe(true);
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

/**
 * **음수 지급액은 다음 달로 넘어간다.** 넘긴다는 말만 있고 넘기는 곳이 없어서, 음수로 확정된 달은 지급이 막힌 채
 * 남았고 다음 달은 그 빚을 모른 채 제 금액을 보냈다.
 */
describe('앞선 달의 빚', () => {
  it('넘어온 음수를 이 달 지급액에서 뺀다', () => {
    const r = calculateSettlement({ gross: won(1_000_000), commissionPercent: 10, refund: won(0), carried: won(-210_000) });
    expect(r.carriedAmount).toBe(-210_000);
    expect(r.netAmount).toBe(900_000 - 210_000);
  });

  it('빼고도 음수면 그대로 음수다 — 또 다음 달로 넘어간다', () => {
    const r = calculateSettlement({ gross: won(100_000), commissionPercent: 10, refund: won(0), carried: won(-500_000) });
    expect(r.netAmount).toBe(-410_000);
  });

  it('넘어온 것이 없으면 예전과 같다', () => {
    const r = calculateSettlement({ gross: won(100_000), commissionPercent: 10, refund: won(0) });
    expect(r.carriedAmount).toBe(0);
    expect(r.netAmount).toBe(90_000);
  });

  it('넘어오는 것은 빚뿐이다 — 양수면 어디선가 두 번 세고 있다', () => {
    expect(() => calculateSettlement({ gross: won(0), commissionPercent: 10, refund: won(0), carried: won(1) }))
      .toThrow(SettlementError);
  });
});

describe('넘길 것과 보낼 것', () => {
  it('확정된 음수만 넘긴다 — 지급·보류·이미 넘긴 것은 넘기지 않는다', () => {
    expect(isCarryable({ status: 'CONFIRMED', netAmount: -1 })).toBe(true);
    expect(isCarryable({ status: 'CONFIRMED', netAmount: 0 })).toBe(false);
    for (const status of ['PENDING', 'PAID', 'HELD', 'CARRIED'] as const) {
      expect(isCarryable({ status, netAmount: -1 }), status).toBe(false);
    }
  });

  it('확정된 0 이상만 보낸다 — 음수는 다음 확정 때 넘어간다', () => {
    expect(isPayable({ status: 'CONFIRMED', netAmount: 0 })).toBe(true);
    expect(isPayable({ status: 'CONFIRMED', netAmount: 1 })).toBe(true);
    expect(isPayable({ status: 'CONFIRMED', netAmount: -1 })).toBe(false);
    for (const status of ['PENDING', 'PAID', 'HELD', 'CARRIED'] as const) {
      expect(isPayable({ status, netAmount: 100 }), status).toBe(false);
    }
  });

  it('넘긴 달은 다시 계산하지 않는다 — 이미 다른 달이 떠안았다', () => {
    expect(isRecalculable('CARRIED')).toBe(false);
  });
});

/**
 * **보류 상태는 있었는데 보류할 길이 없었다.** 확정된 것만 보류하고, 보류된 것만 푼다.
 */
describe('지급 보류', () => {
  it('확정된 것을 보류하고, 보류된 것을 푼다', () => {
    expect(settlementHoldTarget('CONFIRMED', true)).toBe('HELD');
    expect(settlementHoldTarget('HELD', false)).toBe('CONFIRMED');
  });

  it.each(['PENDING', 'PAID', 'HELD', 'CARRIED'] as const)('%s 는 보류하지 않는다 — 끝난 일을 멈춘 척하지 않는다', (status) => {
    expect(() => settlementHoldTarget(status, true)).toThrow(SettlementError);
  });

  it.each(['PENDING', 'CONFIRMED', 'PAID', 'CARRIED'] as const)('%s 는 풀 것이 없다', (status) => {
    expect(() => settlementHoldTarget(status, false)).toThrow(SettlementError);
  });

  it('보류된 것은 지급하지 않는다', () => {
    expect(isPayable({ status: 'HELD', netAmount: 100 })).toBe(false);
  });
});
