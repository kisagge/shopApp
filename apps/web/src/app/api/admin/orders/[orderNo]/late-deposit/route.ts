import { NextResponse } from 'next/server';
import { getActor } from '@shop/auth/session';
import { resolveLateDeposit } from '~/lib/admin/late-deposit';
import { recordAudit } from '~/lib/audit';
import { enforceRateLimit } from '~/lib/rate-limit';
import { apiError, unauthorized } from '~/lib/api/respond';

/** 취소한 주문에 들어온 입금을 손님에게 돌려준 뒤 처리함으로 닫는다 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderNo: string }> },
): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) return await unauthorized();
  const limited = await enforceRateLimit('write', request, actor.id);
  if (limited) return limited;

  const { orderNo } = await params;
  try {
    const result = await resolveLateDeposit(actor, orderNo);
    // 돈이 오간 일이다 — 누가 언제 처리했다고 했는지 남긴다
    await recordAudit({
      actor, action: 'order.resolveLateDeposit', targetType: 'order', targetId: orderNo,
      after: { amount: result.amount, resolvedAt: result.resolvedAt.toISOString() }, request,
    });
    return NextResponse.json(result);
  } catch (error) {
    return await apiError(error);
  }
}
