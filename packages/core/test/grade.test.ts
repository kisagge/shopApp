import { describe, it, expect } from 'vitest';
import { won } from '../src/money';
import {
  MEMBER_GRADE, GRADE_THRESHOLD, GRADE_REWARD_PERCENT,
  gradeFor, nextGrade, gradeProgress, effectiveGrade,
} from '../src/grade';

describe('등급 산정', () => {
  it.each([
    [0, 'BASIC'],
    [299_999, 'BASIC'],
    [300_000, 'SILVER'],
    [999_999, 'SILVER'],
    [1_000_000, 'GOLD'],
    [2_999_999, 'GOLD'],
    [3_000_000, 'VIP'],
    [10_000_000, 'VIP'],
  ] as const)('누적 %s원 → %s', (spent, grade) => {
    expect(gradeFor(won(spent))).toBe(grade);
  });

  it('경계값은 그 등급에 포함된다', () => {
    for (const g of MEMBER_GRADE) {
      expect(gradeFor(GRADE_THRESHOLD[g])).toBe(g);
    }
  });

  it('모든 등급에 적립률이 있다', () => {
    // 이름표는 사전이 가진다 — apps/web 의 enum-labels 검사가 지킨다
    for (const g of MEMBER_GRADE) expect(GRADE_REWARD_PERCENT[g]).toBeGreaterThan(0);
  });

  it('등급이 오를수록 적립률도 오른다', () => {
    const rates = MEMBER_GRADE.map((g) => GRADE_REWARD_PERCENT[g]);
    for (let i = 1; i < rates.length; i += 1) {
      expect(rates[i]!).toBeGreaterThan(rates[i - 1]!);
    }
  });
});

describe('다음 등급', () => {
  it('최고 등급 위에는 없다', () => {
    expect(nextGrade('VIP')).toBeNull();
    expect(nextGrade('GOLD')).toBe('VIP');
  });

  it('다음 등급까지 남은 금액을 알려 준다', () => {
    // 시안의 "다음 등급까지 142,000원" — GOLD(100만) 기준 858,000원 쓴 상태
    const p = gradeProgress(won(858_000));
    expect(p.current).toBe('SILVER');
    expect(p.next).toBe('GOLD');
    expect(p.remaining).toBe(142_000);
  });

  it('현재 구간의 진행률을 준다', () => {
    // SILVER(30만) ~ GOLD(100만) 구간의 절반
    const p = gradeProgress(won(650_000));
    expect(p.percent).toBe(50);
  });

  it('최고 등급이면 남은 금액 0, 진행률 100', () => {
    const p = gradeProgress(won(5_000_000));
    expect(p).toMatchObject({ current: 'VIP', next: null, remaining: 0, percent: 100 });
  });

  it('구매 이력이 없어도 0으로 나누지 않는다', () => {
    const p = gradeProgress(won(0));
    expect(p.current).toBe('BASIC');
    expect(p.percent).toBe(0);
    expect(Number.isNaN(p.percent)).toBe(false);
  });
});

describe('effectiveGrade — 진실이 둘이면 안 된다', () => {
  it('구매로 올라간 등급이 저장된 값보다 높으면 그쪽을 쓴다', () => {
    // 350만원 썼는데 DB 에는 BASIC 으로 남아 있는 경우
    expect(effectiveGrade(won(3_500_000), 'BASIC')).toBe('VIP');
  });

  it('수동으로 올려 준 등급은 구매액이 모자라도 내려가지 않는다', () => {
    // 제휴·보상으로 GOLD 를 준 사람이 아직 10만원밖에 안 썼어도 GOLD 다
    expect(effectiveGrade(won(100_000), 'GOLD')).toBe('GOLD');
  });

  it('둘이 같으면 그대로다', () => {
    expect(effectiveGrade(won(1_000_000), 'GOLD')).toBe('GOLD');
  });

  it('저장 등급을 주면 진행률도 그 등급 기준으로 낸다', () => {
    // 배지는 골드인데 "골드까지 425,000원" 이라고 쓰는 모순을 막는다
    const p = gradeProgress(won(575_000), 'GOLD');
    expect(p.current).toBe('GOLD');
    expect(p.next).toBe('VIP');
  });

  it('수동 등급이라 구매액이 구간에 못 미쳐도 남은 금액이 음수가 되지 않는다', () => {
    const p = gradeProgress(won(0), 'VIP');
    expect(p.remaining).toBe(0);
    expect(p.percent).toBe(100);
  });

  it('진행률이 음수가 되지 않는다', () => {
    const p = gradeProgress(won(50_000), 'GOLD');
    expect(p.percent).toBeGreaterThanOrEqual(0);
  });
});
