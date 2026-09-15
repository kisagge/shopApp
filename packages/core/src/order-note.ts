import { merchantScope, type Actor } from './authz';

/**
 * 주문 내부 메모. 순수 로직만.
 *
 * **손님에게는 어디에도 보이지 않는다** — 손님 화면은 이 표를 읽지 않는다.
 *
 * 누가 보는가:
 * - 운영진은 모든 메모를 본다
 * - 가맹점은 **자기 가맹점이 남긴 메모만** 본다. 운영진 메모에는 손님과 나눈 상담(연락처를 바꿔 달라, 선물이다 등)이
 *   담기는데, 그 주문에 상품 하나 넣은 가맹점이 읽을 말이 아니다. 다른 가맹점의 메모도 같은 이유로 안 보인다.
 *
 * 누가 지우는가: **쓴 사람만.** 남의 메모를 지우면 그 사람이 무엇을 알고 있었는지가 사라진다. 고치기는 없다 — 잘못
 * 썼으면 지우고 다시 쓴다(지운 내용은 감사 로그에 남는다).
 */

export const ORDER_NOTE_MAX = 1000;

/** 메모를 읽을 범위 — 모두(null), 한 가맹점의 것만(문자열), 아무것도(undefined) */
export function orderNoteScope(actor: Actor): string | null | undefined {
  return merchantScope(actor);
}

/** 이 사람이 남기면 메모에 적힐 가맹점. 운영진이면 null */
export function orderNoteMerchantOf(actor: Actor): string | null {
  return merchantScope(actor) ?? null;
}

export function canSeeOrderNote(actor: Actor, note: { readonly merchantId: string | null }): boolean {
  const scope = merchantScope(actor);
  if (scope === undefined) return false;
  return scope === null || note.merchantId === scope;
}

export function canDeleteOrderNote(actor: Actor, note: { readonly authorId: string | null; readonly merchantId: string | null }): boolean {
  return canSeeOrderNote(actor, note) && note.authorId === actor.id;
}
