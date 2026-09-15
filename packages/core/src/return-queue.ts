import { canRefundOrder, canResolveReturnOf, type Actor } from './authz';

/**
 * 반품·교환 처리 대기열 — 신청이 지금 어느 단계이고 **누구 차례인지**. 순수 로직만.
 *
 * 반품은 둘이 나눠 처리한다: 승인·반려와 물건 도착 확인은 물건 곁의 사람(가맹점, 섞였으면 운영진)이, 돈을 내보내는 환불은
 * 운영진이. 주문 목록을 "반품접수" 로 거르면 신청이 어디까지 왔는지(승인했나, 물건이 왔나)가 안 보여, 가맹점은 운영진이
 * 환불할 줄 알고 운영진은 가맹점이 확인할 줄 알고 서로 기다린다.
 */

export const RETURN_STAGE = ['REVIEW', 'AWAIT_ARRIVAL', 'REFUND', 'RESHIP', 'DONE'] as const;
export type ReturnStage = (typeof RETURN_STAGE)[number];

export const RETURN_STAGE_LABEL: Readonly<Record<ReturnStage, string>> = {
  REVIEW: '승인 대기',
  AWAIT_ARRIVAL: '물건 도착 대기',
  REFUND: '환불 대기',
  RESHIP: '교환 상품 발송 대기',
  DONE: '끝남',
};

export function returnStageOf(request: {
  readonly type: string;
  readonly status: string;
  readonly receivedAt: Date | null;
}): ReturnStage {
  if (request.status === 'REQUESTED') return 'REVIEW';
  if (request.status !== 'APPROVED') return 'DONE';
  if (request.receivedAt === null) return 'AWAIT_ARRIVAL';
  return request.type === 'EXCHANGE' ? 'RESHIP' : 'REFUND';
}

/**
 * 이 사람 차례인가.
 *
 * - 승인·도착 확인·교환 발송은 반품 처리 권한으로 — 가맹점은 **신청한 줄이 전부 자기 상품일 때만**(섞였으면 운영진)
 * - 환불은 환불 권한으로(가맹점에게 없다)
 *
 * 화면이 "내 차례" 로 표시해 먼저 볼 것을 가른다. 서버의 처리 창구가 같은 판정으로 다시 막는다.
 */
export function isMyReturnTurn(actor: Actor, stage: ReturnStage, lineMerchantIds: readonly (string | null)[]): boolean {
  switch (stage) {
    case 'REVIEW':
    case 'AWAIT_ARRIVAL':
    case 'RESHIP':
      return canResolveReturnOf(actor, lineMerchantIds);
    case 'REFUND':
      return canRefundOrder(actor);
    case 'DONE':
      return false;
  }
}
