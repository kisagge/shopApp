import { describe, it, expect } from 'vitest';
import {
  NOTIFICATION_KIND, isNotificationKind, formatUnread, UNREAD_BADGE_MAX,
  notificationCutoff, NOTIFICATION_RETENTION_DAYS,
  CONSOLE_NOTIFICATION_KIND, CUSTOMER_NOTIFICATION_KIND,
  shortenReason, NOTICE_REASON_MAX,
} from '../src/notification';
import { NOTIFICATION_PARAMS } from '../src/notification-template';

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

describe('검수 결과 알림', () => {
  it('운영 알림함으로 간다 — 상품을 올린 사람이 들을 말이다', () => {
    /*
     * 손님으로 들어온 자리에 "상품이 되돌아왔습니다" 가 뜨면, 그 사람이
     * 무엇을 해야 하는지 알 수 없다. 재고 부족과 같은 이유다.
     */
    for (const kind of ['PRODUCT_APPROVED', 'PRODUCT_REJECTED'] as const) {
      expect(CONSOLE_NOTIFICATION_KIND, kind).toContain(kind);
      expect(CUSTOMER_NOTIFICATION_KIND as readonly string[], kind).not.toContain(kind);
    }
  });

  it('반려에는 사유가 실린다 — 없으면 무엇을 고칠지 모른다', () => {
    expect(NOTIFICATION_PARAMS.PRODUCT_REJECTED).toContain('reason');
    // 승인에는 사유가 없다. 있을 수 없는 값을 자리로 열어 두지 않는다.
    expect(NOTIFICATION_PARAMS.PRODUCT_APPROVED as readonly string[]).not.toContain('reason');
  });
});

describe('사유 줄이기', () => {
  it('짧으면 그대로 둔다', () => {
    expect(shortenReason('대표 이미지를 바꿔 주세요')).toBe('대표 이미지를 바꿔 주세요');
  });

  it('줄 바꿈은 한 칸으로 만든다 — 목록의 한 줄에 들어가야 한다', () => {
    expect(shortenReason('첫 줄\n\n둘째  줄')).toBe('첫 줄 둘째 줄');
  });

  it('길면 줄이고, 줄였다는 것을 보인다', () => {
    /*
     * 그냥 자르면 문장이 끝난 줄 알고, 뒤에 붙은 조건을 못 보고 같은
     * 실수를 되풀이한다.
     */
    const long = '가'.repeat(200);
    const short = shortenReason(long);

    expect(short.length).toBe(NOTICE_REASON_MAX);
    expect(short.endsWith('…')).toBe(true);
  });

  it('상한에 딱 맞으면 자르지 않는다 — 경계에서 …만 붙는 일이 없게', () => {
    const exact = '나'.repeat(NOTICE_REASON_MAX);
    expect(shortenReason(exact)).toBe(exact);
  });

  it('반려 사유의 최대 길이(500자)를 넣어도 한 줄에 들어간다', () => {
    // 계약이 받아 주는 가장 긴 값이 알림을 통째로 채우면 안 된다
    expect(shortenReason('다'.repeat(500)).length).toBe(NOTICE_REASON_MAX);
  });
});
