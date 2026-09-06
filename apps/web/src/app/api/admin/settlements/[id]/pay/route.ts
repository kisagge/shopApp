import { NextResponse } from 'next/server';
import { ForbiddenError } from '@shop/core';
import { getActor } from '@shop/auth/session';
import { paySettlement, SettlementCloseError } from '~/lib/admin/close-settlement';
import { recordAudit } from '~/lib/audit';
import { forbidden, unauthorized } from '~/lib/api/respond';

/** 지급 집행. 슈퍼관리자만. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return await unauthorized();
  }

  const { id } = await params;

  try {
    const result = await paySettlement(actor, id);
    await recordAudit({
      actor,
      action: 'settlement.pay',
      targetType: 'settlement',
      targetId: id,
      after: { merchantName: result.merchantName, netAmount: result.netAmount },
      request,
    });
    return NextResponse.json(result);
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
