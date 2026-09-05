import type { NotificationKind } from '@shop/core';
import type { MessageKey, Translator } from '@shop/i18n';

/**
 * 알림 한 건을 문장으로 만든다.
 *
 * 저장된 것은 종류와 값뿐이다 — 사용자가 나중에 다른 말로 읽을 수 있어야
 * 하므로 문장을 저장하지 않는다.
 *
 * **값이 빠졌으면 값 없는 문장으로 물러난다.** 상품이 지워졌거나 옛 알림이
 * 그럴 수 있는데, 그때 `{productName} 문의에 답변이…` 처럼 자리표시자가
 * 그대로 보이면 안 된다.
 */
export function notificationText(
  t: Translator,
  kind: NotificationKind,
  params: Record<string, string>,
): string {
  if (kind === 'INQUIRY_ANSWERED' && !params['productName']) {
    return t('notif.INQUIRY_ANSWERED_GENERIC');
  }
  return t(`notif.${kind}` as MessageKey, params);
}
