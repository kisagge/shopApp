import { describe, it, expect } from 'vitest';
import { EXPIRY_NOTICE_LEAD_DAYS, expiryNoticeUntil, kstDate, pointsExpiringSoon } from '../src';

const NOW = new Date('2026-09-15T00:00:00Z'); // KST 09:00
const inDays = (d: number) => new Date(NOW.getTime() + d * 86_400_000);

describe('expiryNoticeUntil / kstDate', () => {
  it('7일 뒤까지, 날짜는 KST 로 자른다', () => {
    expect(expiryNoticeUntil(NOW)).toEqual(inDays(EXPIRY_NOTICE_LEAD_DAYS));
    expect(kstDate(new Date('2026-09-15T15:30:00Z'))).toBe('2026-09-16');
  });
});

describe('pointsExpiringSoon', () => {
  const earn = (amount: number, expiresAt: Date | null) => ({ amount, createdAt: new Date('2026-01-01'), expiresAt });

  it('7일 안에 사라질 안 쓴 몫과 가장 이른 날', () => {
    const r = pointsExpiringSoon([earn(1000, inDays(3)), earn(500, inDays(6)), earn(700, inDays(20))], NOW)!;
    expect(r.amount).toBe(1500);
    expect(r.firstDate).toBe(kstDate(inDays(3)));
    expect(r.days).toHaveLength(2);
  });

  it('이미 쓴 몫은 빼고 센다 — 먼저 사라질 것부터 썼다고 본다', () => {
    const r = pointsExpiringSoon([earn(1000, inDays(3)), earn(500, inDays(6)), { amount: -1200, createdAt: new Date('2026-02-01'), expiresAt: null }], NOW)!;
    expect(r.amount).toBe(300);
    expect(r.firstDate).toBe(kstDate(inDays(6)));
  });

  it('사라질 것이 없으면 null — 기한 없는 적립·이미 지난 것·7일 넘는 것', () => {
    expect(pointsExpiringSoon([earn(1000, null), earn(1000, inDays(-1)), earn(1000, inDays(8))], NOW)).toBeNull();
  });
});
