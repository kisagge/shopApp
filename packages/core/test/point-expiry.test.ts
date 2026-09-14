import { describe, it, expect } from 'vitest';
import { expirableAmount, expiringSoonAmount, pointExpirySchedule, EXPIRY_NOTICE_DAYS } from '../src/point-expiry';

const NOW = new Date('2026-09-04T00:00:00Z');
const day = (n: number) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);

const earn = (amount: number, createdDay: number, expiresDay: number | null) => ({
  amount, createdAt: day(createdDay),
  expiresAt: expiresDay === null ? null : day(expiresDay),
});
const spend = (amount: number, createdDay: number) => ({
  amount: -amount, createdAt: day(createdDay), expiresAt: null,
});

describe('소멸시킬 금액', () => {
  it('원장이 비면 0', () => {
    expect(expirableAmount([], NOW)).toBe(0);
  });

  it('기한이 지난 적립은 소멸한다', () => {
    expect(expirableAmount([earn(1000, -400, -35)], NOW)).toBe(1000);
  });

  it('기한이 남은 적립은 건드리지 않는다', () => {
    expect(expirableAmount([earn(1000, -10, 355)], NOW)).toBe(0);
  });

  it('기한이 없는 적립은 소멸하지 않는다', () => {
    // 운영 조정이나 환불 반환분이다. 없앨 근거가 없다.
    expect(expirableAmount([earn(1000, -400, null)], NOW)).toBe(0);
  });

  it('이미 쓴 만큼은 소멸할 것이 없다', () => {
    expect(expirableAmount([earn(1000, -400, -35), spend(1000, -300)], NOW)).toBe(0);
  });

  it('쓰고 남은 만큼만 소멸한다', () => {
    expect(expirableAmount([earn(1000, -400, -35), spend(400, -300)], NOW)).toBe(600);
  });
});

describe('무엇부터 쓴 것으로 치는가', () => {
  it('먼저 없어질 것부터 쓴 것으로 친다', () => {
    /*
     * 반대로 짝지으면 곧 사라질 포인트를 남겨 두고 멀쩡한 것을 먼저
     * 태우는 셈이 된다 — 고객에게 손해다.
     */
    const entries = [
      earn(1000, -400, -35), // 이미 지남
      earn(1000, -10, 355), // 아직 남음
      spend(1000, -5),
    ];
    // 지난 것부터 썼으므로 소멸할 것이 없다
    expect(expirableAmount(entries, NOW)).toBe(0);
  });

  it('기한 없는 적립은 맨 뒤로 미룬다', () => {
    // 언제든 쓸 수 있으니 아껴 두는 것이 맞다
    const entries = [
      earn(1000, -400, null), // 무기한
      earn(1000, -300, -35), // 지남
      spend(1000, -5),
    ];
    expect(expirableAmount(entries, NOW)).toBe(0);
  });

  it('기한이 같으면 오래된 것부터', () => {
    const entries = [earn(500, -10, -1), earn(500, -20, -1), spend(500, -5)];
    expect(expirableAmount(entries, NOW)).toBe(500);
  });
});

describe('두 번 소멸시키지 않는다', () => {
  it('이미 적힌 소멸도 차감으로 센다', () => {
    /*
     * 배치가 하루에 몇 번 돌아도 결과가 같아야 한다. 소멸 기록이 음수라
     * 그대로 차감되므로 같은 포인트가 두 번 사라지지 않는다.
     */
    const entries = [
      earn(1000, -400, -35),
      { amount: -1000, createdAt: day(-1), expiresAt: null }, // 지난번 소멸
    ];
    expect(expirableAmount(entries, NOW)).toBe(0);
  });

  it('일부만 소멸된 뒤 나머지는 다음에 소멸한다', () => {
    const entries = [
      earn(1000, -400, -35),
      earn(500, -300, -20),
      { amount: -1000, createdAt: day(-1), expiresAt: null },
    ];
    expect(expirableAmount(entries, NOW)).toBe(500);
  });
});

describe('곧 사라질 포인트', () => {
  it('기간 안에 없어질 것만 센다', () => {
    const entries = [earn(1000, -300, 10), earn(2000, -300, 200)];
    expect(expiringSoonAmount(entries, NOW)).toBe(1000);
  });

  it('이미 지난 것은 빼고 센다 — 그건 소멸 대상이지 예고가 아니다', () => {
    const entries = [earn(1000, -400, -1), earn(500, -300, 10)];
    expect(expiringSoonAmount(entries, NOW)).toBe(500);
  });

  it('기간 밖이면 0', () => {
    expect(expiringSoonAmount([earn(1000, -10, EXPIRY_NOTICE_DAYS + 5)], NOW)).toBe(0);
  });
});

describe('날짜별 소멸 예정', () => {
  // NOW 는 KST 2026-09-04 09:00
  const at = (iso: string) => new Date(iso);
  const earnAt = (amount: number, expiresIso: string | null) => ({
    amount, createdAt: day(-100), expiresAt: expiresIso === null ? null : at(expiresIso),
  });

  it('남은 적립을 날짜별로 묶어 가까운 날부터 적는다', () => {
    const schedule = pointExpirySchedule([
      earnAt(300, '2026-10-01T03:00:00Z'),
      earnAt(200, '2026-09-10T03:00:00Z'),
      earnAt(100, '2026-10-01T05:00:00Z'),
    ], NOW);
    expect(schedule.map(({ date, amount, daysLeft }) => ({ date, amount, daysLeft }))).toEqual([
      { date: '2026-09-10', amount: 200, daysLeft: 6 },
      { date: '2026-10-01', amount: 400, daysLeft: 27 },
    ]);
    // 같은 날 둘이면 이른 기한을 대표로
    expect(schedule[1]!.expiresAt.toISOString()).toBe('2026-10-01T03:00:00.000Z');
  });

  it('날짜는 KST 로 자른다 — UTC 로 자르면 하루 앞 날짜에 묶인다', () => {
    // UTC 9월 9일 16:00 = KST 9월 10일 01:00
    const [only] = pointExpirySchedule([earnAt(500, '2026-09-09T16:00:00Z')], NOW);
    expect(only!.date).toBe('2026-09-10');
    expect(only!.daysLeft).toBe(6);
  });

  it('오늘 안에 사라지는 몫은 D-0, 이미 지난 몫과 기한 없는 몫은 넣지 않는다', () => {
    const schedule = pointExpirySchedule([
      earnAt(100, '2026-09-04T10:00:00Z'), // KST 오늘 19:00
      earnAt(200, '2026-09-03T00:00:00Z'), // 지남
      earnAt(300, null),
    ], NOW);
    expect(schedule).toHaveLength(1);
    expect(schedule[0]).toMatchObject({ date: '2026-09-04', amount: 100, daysLeft: 0 });
  });

  it('쓴 만큼은 기한이 가까운 적립에서 먼저 뺀다 — 소멸 배치와 같은 짝짓기', () => {
    const schedule = pointExpirySchedule([
      earnAt(1000, '2026-09-20T00:00:00Z'),
      earnAt(1000, '2026-12-01T00:00:00Z'),
      spend(1500, -5),
    ], NOW);
    expect(schedule.map((d) => d.amount)).toEqual([500]);
    expect(schedule[0]!.date).toBe('2026-12-01');
  });

  it('기간 안의 합이 "N일 안에 사라진다" 는 한 줄과 같다', () => {
    const entries = [
      earn(700, -300, 3), earn(400, -200, 29), earn(900, -100, 31), earn(250, -50, 12), spend(500, -10),
    ];
    const within = pointExpirySchedule(entries, NOW, EXPIRY_NOTICE_DAYS);
    expect(within.reduce((s, d) => s + d.amount, 0)).toBe(expiringSoonAmount(entries, NOW));
    expect(within.every((d) => d.daysLeft <= EXPIRY_NOTICE_DAYS)).toBe(true);
  });
});
