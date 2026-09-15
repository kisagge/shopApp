import { NextResponse } from 'next/server';
import { ForbiddenError } from '@shop/core';
import { getActor } from '@shop/auth/session';
import { deleteOrderNote, OrderNoteError } from '~/lib/orders/order-notes';
import { recordAudit } from '~/lib/audit';
import { enforceRateLimit } from '~/lib/rate-limit';
import { forbidden, unauthorized } from '~/lib/api/respond';

/** 주문 내부 메모 지우기 — 쓴 사람만. 지운 내용은 감사 로그에 남는다 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ orderNo: string; noteId: string }> },
): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return await unauthorized();
  }
  const limited = await enforceRateLimit('write', request, actor.id);
  if (limited) return limited;

  const { orderNo, noteId } = await params;
  try {
    const before = await deleteOrderNote(actor, orderNo, noteId);
    await recordAudit({ actor, action: 'order.note.delete', targetType: 'order', targetId: orderNo, before, request });
    return NextResponse.json({ id: before.id });
  } catch (error) {
    if (error instanceof OrderNoteError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    if (error instanceof ForbiddenError) {
      return await forbidden();
    }
    throw error;
  }
}
