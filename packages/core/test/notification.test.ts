import { describe, it, expect } from 'vitest';
import {
  NOTIFICATION_KIND, isNotificationKind, formatUnread, UNREAD_BADGE_MAX,
  notificationCutoff, NOTIFICATION_RETENTION_DAYS,
} from '../src/notification';

describe('알림 종류', () => {
  it('아는 값만 받는다', () => {
    for (const k of NOTIFICATION_KIND) expect(isNotificationKind(k)).toBe(true);
    expect(isNotificationKind('SOMETHING')).toBe(false);
    expect(isNotificationKind(null)).toBe(false);
  });

  it('종류에 문구가 섞여 있지 않다', () => {
    // 문구는 화면이 만든다. 여기 한국어가 들어오면 그 화면만 한국어로 굳는다.
    for (const k of NOTIFICATION_KIND) expect(k).toMatch(/^[A-Z_]+$/);
  });
});

describe('뱃지 숫자', () => {
  it('그대로 보여 준다', () => {
    expect(formatUnread(0)).toBe('0');
    expect(formatUnread(7)).toBe('7');
    expect(formatUnread(UNREAD_BADGE_MAX)).toBe('99');
  });

  it('상한을 넘으면 접는다 — 세 자리는 뱃지를 깨뜨린다', () => {
    expect(formatUnread(UNREAD_BADGE_MAX + 1)).toBe('99+');
    expect(formatUnread(4000)).toBe('99+');
  });
});

describe('보관 기간', () => {
  it('기간이 지난 것만 지울 수 있다', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    const cutoff = notificationCutoff(now);
    const days = (now.getTime() - cutoff.getTime()) / (24 * 60 * 60 * 1000);
    expect(days).toBe(NOTIFICATION_RETENTION_DAYS);
  });

  it('기간을 넘겨 줄 수 있다', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    expect(notificationCutoff(now, 1).toISOString()).toBe('2026-05-31T00:00:00.000Z');
  });
});
