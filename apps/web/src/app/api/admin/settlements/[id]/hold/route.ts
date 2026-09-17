import { NextResponse } from 'next/server';
import { ForbiddenError } from '@shop/core';
import { settlementHoldSchema } from '@shop/contract';
import { getActor } from '@shop/auth/session';
import { holdSettlement, SettlementCloseError } from '~/lib/admin/close-settlement';
import { recordAudit } from '~/lib/audit';
import { validationFailed } from '~/lib/i18n/validation';
import { forbidden, invalidJson, unauthorized } from '~/lib/api/respond';

/** 지급 보류·해제. 슈퍼관리자만 — 지급을 멈추는 것도 지급의 일이다. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return await unauthorized();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return await invalidJson();
  }
  const parsed = settlementHoldSchema.safeParse(body);
  if (!parsed.success) {
    return validationFailed(parsed.error);
  }

  const { id } = await params;
  try {
    const result = await holdSettlement(actor, id, parsed.data);
    // 돈이 나가느냐 마느냐다. 누가 왜 멈췄는지·풀었는지 남긴다
    await recordAudit({
      actor,
      action: parsed.data.hold ? 'settlement.hold' : 'settlement.release',
      targetType: 'settlement',
      targetId: id,
      before: { status: result.before },
      after: { status: result.status, reason: result.reason, merchantName: result.merchantName },
      request,
    });
    return NextResponse.json({ id: result.id, status: result.status, reason: result.reason });
  } catch (error) {
    if (error instanceof SettlementCloseError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    if (error instanceof ForbiddenError) {
      return await forbidden();
    }
    throw error;
  }
}
