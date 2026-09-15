import type { MailTemplateKind } from './mail-template';
import type { NotificationKind } from './notification';

/**
 * 계정에 운영진이 한 일을 손님에게 알리는 규칙 — 적립금 수동 지급·차감, 이용 정지·해제. 순수 로직만.
 *
 * 전에는 알리지 않았다. 적립금은 내역에 사유만 남아 잔액이 왜 바뀌었는지 들어가 봐야 알았고, 정지된 손님은 로그인이
 * 막혀서야 알았다 — "비밀번호가 틀렸나" 로 먼저 읽는다.
 */

export const ACCOUNT_NOTICE_KIND = ['POINTS_GRANTED', 'POINTS_DEDUCTED', 'ACCOUNT_SUSPENDED', 'ACCOUNT_RESTORED'] as const;
export type AccountNoticeKind = (typeof ACCOUNT_NOTICE_KIND)[number] & MailTemplateKind;

/**
 * 알림함에 남기는가.
 *
 * **정지는 남기지 않는다** — 정지된 사람은 로그인할 수 없어 알림함을 못 연다. 풀렸을 때 열면 이미 지난 "정지되었습니다" 가
 * 맨 위에 있어 지금도 막힌 줄 안다. 정지는 메일로만 알린다.
 */
export function accountNoticeInbox(kind: AccountNoticeKind): NotificationKind | null {
  return kind === 'ACCOUNT_SUSPENDED' ? null : kind;
}
