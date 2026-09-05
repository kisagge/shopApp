/**
 * 알림 규칙. 순수 로직만, I/O 없음.
 *
 * **문구는 여기 없다.** 알림은 나중에 읽는 글이고 그 사이에 사용자가 언어를
 * 바꿀 수 있다 — 만들 때의 말로 굳혀 두면 그때 어긋난다. 무슨 일이 있었는지와
 * 끼울 값만 정하고, 문장은 화면이 만든다.
 */

export const NOTIFICATION_KIND = [
  'ORDER_SHIPPED',
  'ORDER_DELIVERED',
  'INQUIRY_ANSWERED',
  'RESTOCKED',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KIND)[number];

export const isNotificationKind = (value: unknown): value is NotificationKind =>
  typeof value === 'string' && (NOTIFICATION_KIND as readonly string[]).includes(value);

/**
 * 머리에 띄울 개수의 상한.
 *
 * 안 읽은 것이 쌓이면 "99+" 로 접는다. 세 자리 숫자가 뱃지에 들어가면 글자가
 * 깨지고, 그보다 **정확한 개수가 더 이상 정보가 아니다** — 200개든 300개든
 * 사용자가 할 일은 같다.
 */
export const UNREAD_BADGE_MAX = 99;

export const formatUnread = (count: number): string =>
  count > UNREAD_BADGE_MAX ? `${UNREAD_BADGE_MAX}+` : String(count);

/**
 * 목록에 담아 둘 기간.
 *
 * 지난 알림을 영영 쌓아 두면 표가 계속 크고, 오래된 것은 아무도 열지 않는다.
 * 이 기간이 지난 것은 배치가 지운다.
 */
export const NOTIFICATION_RETENTION_DAYS = 90;

/** 이 시각보다 오래된 알림은 지워도 된다 */
export function notificationCutoff(now: Date, days = NOTIFICATION_RETENTION_DAYS): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}
