import { describe, it, expect } from 'vitest';
import {
  dayKeyOf,
  dayWindow,
  nextDay,
  isClosedDay,
  daysToRollUp,
  deletableThrough,
  RollupError,
  MAX_DAYS_PER_RUN,
} from '../src/event-rollup';

/** KST 자정 = 전날 UTC 15:00 */
const kstMidnight = (day: string) => new Date(`${day}T00:00:00+09:00`);

describe('KST 하루 경계', () => {
  it('오전 9시 이전도 같은 날이다 — UTC 로 자르면 어제로 넘어간다', () => {
    // 09-03 08:59 KST 는 09-02 23:59 UTC 다.
    expect(dayKeyOf(new Date('2026-09-03T08:59:00+09:00'))).toBe('2026-09-03');
    // 같은 순간을 UTC 로 자르면 09-02 가 됐을 것이다
    expect(new Date('2026-09-03T08:59:00+09:00').toISOString()).toContain('2026-09-02');
  });

  it('자정 직전은 아직 그날이다', () => {
    expect(dayKeyOf(new Date('2026-09-03T23:59:59+09:00'))).toBe('2026-09-03');
    expect(dayKeyOf(new Date('2026-09-04T00:00:00+09:00'))).toBe('2026-09-04');
  });

  it('하루 창은 KST 자정에서 다음 자정까지, 끝은 포함하지 않는다', () => {
    const w = dayWindow('2026-09-03');
    expect(w.start.toISOString()).toBe('2026-09-02T15:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-09-03T15:00:00.000Z');
    expect(w.end.getTime() - w.start.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('월·연 경계를 넘어간다', () => {
    expect(nextDay('2026-09-30')).toBe('2026-10-01');
    expect(nextDay('2026-12-31')).toBe('2027-01-01');
    expect(nextDay('2028-02-28')).toBe('2028-02-29'); // 윤년
  });

  it('없는 날짜는 조용히 굴러가지 않고 거부한다', () => {
    // Date.UTC(2026, 1, 31) 은 3월 3일이 된다. 그대로 두면 2월 31일치를
    // 집계했다고 믿으면서 3월 데이터를 접는다.
    expect(() => dayWindow('2026-02-31')).toThrow(RollupError);
    expect(() => dayWindow('2026-13-01')).toThrow(RollupError);
    expect(() => dayWindow('20260903')).toThrow(RollupError);
  });
});

describe('끝난 하루만 접는다', () => {
  const now = new Date('2026-09-03T10:00:00+09:00');

  it('어제는 끝났다', () => {
    expect(isClosedDay('2026-09-02', now)).toBe(true);
  });

  it('오늘은 아직 끝나지 않았다 — 접고 원본을 지우면 남은 시간이 사라진다', () => {
    expect(isClosedDay('2026-09-03', now)).toBe(false);
  });

  it('경계는 자정 그 순간이다', () => {
    expect(isClosedDay('2026-09-02', new Date('2026-09-03T00:00:00+09:00'))).toBe(true);
    expect(isClosedDay('2026-09-02', new Date('2026-09-02T23:59:59+09:00'))).toBe(false);
  });
});

describe('접을 날 고르기', () => {
  const now = new Date('2026-09-03T10:00:00+09:00');

  it('마지막으로 접은 날 다음부터 어제까지', () => {
    expect(daysToRollUp({ lastRolledUp: '2026-08-31', oldestRaw: '2026-08-01', now })).toEqual([
      '2026-09-01',
      '2026-09-02',
    ]);
  });

  it('처음 도는 배치는 가장 오래된 원본부터', () => {
    expect(daysToRollUp({ lastRolledUp: null, oldestRaw: '2026-09-01', now })).toEqual([
      '2026-09-01',
      '2026-09-02',
    ]);
  });

  it('원본도 롤업도 없으면 할 일이 없다', () => {
    expect(daysToRollUp({ lastRolledUp: null, oldestRaw: null, now })).toEqual([]);
  });

  it('이미 어제까지 접었으면 할 일이 없다', () => {
    expect(daysToRollUp({ lastRolledUp: '2026-09-02', oldestRaw: '2026-08-01', now })).toEqual([]);
  });

  it('밀린 날이 많아도 한 번에 다 하지 않는다 — 서버리스는 중간에 끊긴다', () => {
    const days = daysToRollUp({ lastRolledUp: '2025-01-01', oldestRaw: '2025-01-01', now });
    expect(days).toHaveLength(MAX_DAYS_PER_RUN);
    expect(days[0]).toBe('2025-01-02');
  });

  it('중간을 건너뛰지 않고 이어서 준다', () => {
    const days = daysToRollUp({ lastRolledUp: '2026-08-28', oldestRaw: '2026-08-01', now });
    expect(days).toEqual(['2026-08-29', '2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02']);
  });
});

describe('원본 삭제 경계 — 접힌 날만 지운다', () => {
  const now = kstMidnight('2026-09-03');

  it('보존 기간이 지났어도 접히지 않았으면 지우지 않는다', () => {
    // 롤업이 6월에서 멈춰 있다. 보존 경계(6/5)보다 이르므로 롤업선이 이긴다.
    expect(deletableThrough({ lastRolledUp: '2026-06-01', now, retentionDays: 90 })).toBe(
      '2026-06-01',
    );
  });

  it('한 번도 접은 적이 없으면 아무것도 지우지 않는다', () => {
    expect(deletableThrough({ lastRolledUp: null, now })).toBeNull();
  });

  it('접혀 있어도 보존 기간 안이면 지우지 않는다', () => {
    // 어제까지 접었지만 90일 보존이므로 지울 수 있는 것은 6/5 까지다.
    const through = deletableThrough({ lastRolledUp: '2026-09-02', now, retentionDays: 90 });
    expect(through).toBe('2026-06-05');
    expect(through! < '2026-09-02').toBe(true);
  });

  it('보존 기간이 지난 날짜만 남긴다 — 경계는 정확히 N일 전', () => {
    expect(deletableThrough({ lastRolledUp: '2026-09-02', now, retentionDays: 30 })).toBe(
      '2026-08-04',
    );
    expect(deletableThrough({ lastRolledUp: '2026-09-02', now, retentionDays: 1 })).toBe(
      '2026-09-02',
    );
  });

  it('롤업이 멈추면 삭제도 함께 멈춘다', () => {
    // 롤업이 8/10 에서 멈춘 채 시간이 흘러도, 지울 수 있는 선은 8/10 을 넘지 않는다.
    const later = kstMidnight('2027-01-01');
    expect(deletableThrough({ lastRolledUp: '2026-08-10', now: later, retentionDays: 90 })).toBe(
      '2026-08-10',
    );
  });
});
