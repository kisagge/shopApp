import { NextResponse } from 'next/server';
import { adjustPointsSchema } from '@shop/contract';
import { getActor } from '@shop/auth/session';
import { adjustPoints } from '~/lib/admin/adjust-points';
import { notifyPointsAdjusted } from '~/lib/account/notify-account';
import { recordAudit } from '~/lib/audit';
import { enforceRateLimit } from '~/lib/rate-limit';
import { apiError, unauthorized } from '~/lib/api/respond';
import { readBody } from '~/lib/api/read-body';

/**
 * 적립금 수동 지급·차감. 누가 누구에게 얼마를 왜 줬는지 감사 로그에 남긴다 — 포인트는 돈이다.
 *
 * 같은 열쇠로 다시 온 요청은 새로 기록하지 않는다. 한 번 나간 돈에 감사 줄이 두 개면 두 번 나간 것으로 읽힌다.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return await unauthorized();
  }
  const limited = await enforceRateLimit('write', request, actor.id);
  if (limited) return limited;

  const parsed = await readBody(request, adjustPointsSchema);
  if (!parsed.ok) return parsed.response;

  const { id } = await params;

  try {
    const result = await adjustPoints(actor, id, parsed.data);
    if (!result.replayed) {
      await recordAudit({
        actor,
        action: result.direction === 'GRANT' ? 'points.grant' : 'points.deduct',
        targetType: 'user',
        targetId: id,
        before: { balance: result.direction === 'GRANT' ? result.balance - result.amount : result.balance + result.amount },
        after: { balance: result.balance, amount: result.amount, note: result.note },
        request,
      });
      // 같은 열쇠로 다시 온 요청이면 알림도 다시 보내지 않는다 — 두 번 받은 줄 안다
      await notifyPointsAdjusted(result);
    }
    return NextResponse.json(result);
  } catch (error) {
    return await apiError(error);
  }
}
