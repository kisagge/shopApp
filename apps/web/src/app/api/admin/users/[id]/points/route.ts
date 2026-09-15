import { NextResponse } from 'next/server';
import { adjustPointsSchema } from '@shop/contract';
import { ForbiddenError } from '@shop/core';
import { getActor } from '@shop/auth/session';
import { adjustPoints } from '~/lib/admin/adjust-points';
import { AccessError } from '~/lib/admin/manage-access';
import { recordAudit } from '~/lib/audit';
import { enforceRateLimit } from '~/lib/rate-limit';
import { validationFailed } from '~/lib/i18n/validation';
import { forbidden, invalidJson, unauthorized } from '~/lib/api/respond';

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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return await invalidJson();
  }

  const parsed = adjustPointsSchema.safeParse(body);
  if (!parsed.success) {
    return validationFailed(parsed.error);
  }

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
    }
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    if (error instanceof ForbiddenError) {
      return await forbidden();
    }
    throw error;
  }
}
