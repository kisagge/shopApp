import { describe, it, expect } from 'vitest';
import {
  ACCOUNT_NOTICE_KIND, MAIL_TEMPLATE_KIND, NOTIFICATION_KIND, NOTIFICATION_PARAMS, MAIL_TEMPLATE_PARAMS,
  accountNoticeInbox,
} from '../src';

describe('계정 알림', () => {
  it('정지는 알림함에 남기지 않는다 — 정지된 사람은 알림함을 못 연다', () => {
    expect(accountNoticeInbox('ACCOUNT_SUSPENDED')).toBeNull();
    expect(accountNoticeInbox('ACCOUNT_RESTORED')).toBe('ACCOUNT_RESTORED');
    expect(accountNoticeInbox('POINTS_GRANTED')).toBe('POINTS_GRANTED');
    expect(accountNoticeInbox('POINTS_DEDUCTED')).toBe('POINTS_DEDUCTED');
  });

  it('넷 다 메일 종류이고, 정지를 뺀 셋은 알림 종류다', () => {
    for (const kind of ACCOUNT_NOTICE_KIND) expect(MAIL_TEMPLATE_KIND).toContain(kind);
    expect(NOTIFICATION_KIND).not.toContain('ACCOUNT_SUSPENDED');
    for (const kind of ['POINTS_GRANTED', 'POINTS_DEDUCTED', 'ACCOUNT_RESTORED'] as const) expect(NOTIFICATION_KIND).toContain(kind);
  });

  it('끼울 값 — 적립금은 포인트, 정지·해제는 이름만', () => {
    expect(NOTIFICATION_PARAMS.POINTS_GRANTED).toEqual(['points']);
    expect(NOTIFICATION_PARAMS.ACCOUNT_RESTORED).toEqual([]);
    expect(MAIL_TEMPLATE_PARAMS.POINTS_DEDUCTED).toEqual({ subject: ['points'], heading: [], lead: ['name', 'points'] });
    expect(MAIL_TEMPLATE_PARAMS.ACCOUNT_SUSPENDED).toEqual({ subject: [], heading: [], lead: ['name'] });
  });
});
