import 'server-only';
import { prisma } from '@shop/db';
import {
  assertPermission, canDeleteOrderNote, orderNoteMerchantOf, orderNoteScope,
  type Actor,
} from '@shop/core';

export interface OrderNoteView {
  readonly id: string;
  readonly body: string;
  readonly createdAt: Date;
  readonly authorName: string;
  /** 가맹점이 남겼으면 그 이름. 운영진 메모면 null */
  readonly merchantName: string | null;
  /** 이 화면을 보는 사람이 지울 수 있는가(쓴 사람) */
  readonly deletable: boolean;
}

export class OrderNoteError extends Error {
  constructor(readonly code: 'ORDER_NOT_FOUND' | 'NOTE_NOT_FOUND' | 'NOT_AUTHOR', message: string, readonly status: number) {
    super(message);
    this.name = 'OrderNoteError';
  }
}

/** 이 사람이 볼 수 있는 주문인가 — 운영 주문 상세와 같은 범위(가맹점은 자기 상품이 든 주문) */
async function findOrder(actor: Actor, orderNo: string): Promise<{ id: string }> {
  // 손님도 order:read 가 있다(자기 주문). 운영 화면의 일이라 콘솔 권한부터 본다
  assertPermission(actor, 'admin:access');
  assertPermission(actor, 'order:read');
  const scope = orderNoteScope(actor);
  if (scope === undefined) throw new OrderNoteError('ORDER_NOT_FOUND', '주문을 찾을 수 없습니다.', 404);
  const order = await prisma.order.findFirst({
    where: { orderNo, ...(scope ? { items: { some: { merchantId: scope } } } : {}) },
    select: { id: true },
  });
  if (!order) throw new OrderNoteError('ORDER_NOT_FOUND', '주문을 찾을 수 없습니다.', 404);
  return order;
}

/**
 * 이 주문에서 이 사람이 볼 수 있는 메모, 오래된 것부터.
 *
 * **보는 범위를 where 로 건다.** 읽어 놓고 거르면 어딘가에서 한 줄 빠뜨렸을 때 운영진 상담 메모가 가맹점 화면으로 샌다.
 */
export async function listOrderNotes(actor: Actor, orderId: string): Promise<OrderNoteView[]> {
  const scope = orderNoteScope(actor);
  if (scope === undefined) return [];
  const rows = await prisma.orderNote.findMany({
    where: { orderId, ...(scope ? { merchantId: scope } : {}) },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true, body: true, createdAt: true, authorId: true, merchantId: true,
      author: { select: { name: true } },
      merchant: { select: { name: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    createdAt: r.createdAt,
    authorName: r.author?.name ?? '지워진 계정',
    merchantName: r.merchant?.name ?? null,
    deletable: canDeleteOrderNote(actor, r),
  }));
}

export async function addOrderNote(
  actor: Actor,
  orderNo: string,
  body: string,
): Promise<{ id: string; body: string; merchantId: string | null }> {
  const order = await findOrder(actor, orderNo);
  return prisma.orderNote.create({
    data: { orderId: order.id, authorId: actor.id, merchantId: orderNoteMerchantOf(actor), body },
    select: { id: true, body: true, merchantId: true },
  });
}

/**
 * 메모 지우기 — 쓴 사람만. 볼 수 없는 메모는 없는 메모다(있다는 것도 알려 주지 않는다).
 * 지운 내용은 돌려준다 — 감사 로그에 남긴다.
 */
export async function deleteOrderNote(
  actor: Actor,
  orderNo: string,
  noteId: string,
): Promise<{ id: string; body: string; merchantId: string | null }> {
  const order = await findOrder(actor, orderNo);
  const scope = orderNoteScope(actor);
  const note = await prisma.orderNote.findFirst({
    where: { id: noteId, orderId: order.id, ...(scope ? { merchantId: scope } : {}) },
    select: { id: true, body: true, authorId: true, merchantId: true },
  });
  if (!note) throw new OrderNoteError('NOTE_NOT_FOUND', '메모를 찾을 수 없습니다.', 404);
  if (!canDeleteOrderNote(actor, note)) {
    throw new OrderNoteError('NOT_AUTHOR', '메모는 남긴 사람만 지울 수 있습니다.', 403);
  }
  await prisma.orderNote.delete({ where: { id: note.id } });
  return { id: note.id, body: note.body, merchantId: note.merchantId };
}
