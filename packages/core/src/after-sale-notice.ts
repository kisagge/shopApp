import type { MailTemplateKind } from './mail-template';
import type { NotificationKind } from './notification';

/**
 * 주문 뒤의 일 — 취소·반품 승인·반려·환불을 손님에게 알리는 규칙. 순수 로직만.
 *
 * 전에는 출고·배송완료·교환 발송만 알렸다. 돈이 돌아가는 일(취소·환불)과 반품 신청의 결과는 손님이 주문 화면을
 * 다시 열어야 알았고, 모르고 넘어가면 "환불 언제 되나요" 가 문의로 왔다.
 */

export const AFTER_SALE_KIND = ['ORDER_CANCELLED', 'RETURN_APPROVED', 'RETURN_REJECTED', 'REFUND_COMPLETED'] as const;
export type AfterSaleKind = (typeof AFTER_SALE_KIND)[number] & NotificationKind & MailTemplateKind;

/** 누가 일으켰는가 — 손님 자신, 운영진·가맹점, 배치 */
export type AfterSaleBy = 'customer' | 'staff' | 'system';

export function afterSaleByOf(input: { readonly actorId: string; readonly customerId: string; readonly system: boolean }): AfterSaleBy {
  if (input.system) return 'system';
  return input.actorId === input.customerId ? 'customer' : 'staff';
}

/**
 * 알림함에 남기는가. **손님이 스스로 한 일은 남기지 않는다** — 방금 누른 사람의 알림함에 "취소되었습니다" 가 뜨면
 * 소음이다. 메일은 보낸다: 돈이 돌아가는 일의 기록이라 받은편지함에 남는 편이 낫다.
 */
export const recordsNotification = (by: AfterSaleBy): boolean => by !== 'customer';

/**
 * 취소 사유를 손님에게 보여 주는가.
 *
 * 운영진이 적는 취소 메모("어드민 취소", 내부 사정)는 **손님에게 쓴 말이 아니다** — 보여 주지 않는다. 손님이 적은
 * 사유와 배치가 적은 사유("결제 대기 시간이 지나…")는 손님이 알아야 할 말이라 보여 준다. 반품 반려 사유는 손님에게
 * 쓰라고 받는 칸이라 늘 보여 준다(반려는 운영진만 하므로 by 와 상관없다).
 */
export function showsReason(kind: AfterSaleKind, by: AfterSaleBy): boolean {
  if (kind === 'RETURN_REJECTED') return true;
  if (kind === 'ORDER_CANCELLED') return by !== 'staff';
  return false;
}
