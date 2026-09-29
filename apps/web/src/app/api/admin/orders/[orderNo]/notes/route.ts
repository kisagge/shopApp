import { NextResponse } from 'next/server';
import { orderNoteSchema } from '@shop/contract';
import { getActor } from '@shop/auth/session';
import { addOrderNote } from '~/lib/orders/order-notes';
import { recordAudit } from '~/lib/audit';
import { enforceRateLimit } from '~/lib/rate-limit';
import { apiError, unauthorized } from '~/lib/api/respond';
import { readBody } from '~/lib/api/read-body';

/** 주문 내부 메모 남기기. 손님에게는 보이지 않는다 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderNo: string }> },
): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return await unauthorized();
  }
  const limited = await enforceRateLimit('write', request, actor.id);
  if (limited) return limited;

  const parsed = await readBody(request, orderNoteSchema);
  if (!parsed.ok) return parsed.response;

  const { orderNo } = await params;
  try {
    const note = await addOrderNote(actor, orderNo, parsed.data.body);
    await recordAudit({ actor, action: 'order.note.add', targetType: 'order', targetId: orderNo, after: note, request });
    return NextResponse.json(note, { status: 201 });
  } catch (error) {
    return await apiError(error);
  }
}
