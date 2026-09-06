import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ForbiddenError, SettlementError } from '@shop/core';
import { getActor } from '@shop/auth/session';
import { closeSettlements, SettlementCloseError } from '~/lib/admin/close-settlement';
import { recordAudit } from '~/lib/audit';
import { validationFailed } from '~/lib/i18n/validation';
import { forbidden, invalidJson, unauthorized } from '~/lib/api/respond';

const bodySchema = z.object({ yearMonth: z.string().regex(/^\d{4}-\d{2}$/) });

/** 정산 기간 확정. 여러 번 눌러도 결과가 같다. */
export async function POST(request: Request): Promise<NextResponse> {
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

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return validationFailed(parsed.error);
  }

  try {
    const result = await closeSettlements(actor, parsed.data.yearMonth);
    await recordAudit({
      actor,
      action: 'settlement.close',
      targetType: 'settlement',
      targetId: parsed.data.yearMonth,
      after: result,
      request,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof SettlementCloseError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    if (error instanceof SettlementError) {
      return NextResponse.json({ code: 'INVALID_PERIOD', message: error.message }, { status: 400 });
    }
    if (error instanceof ForbiddenError) {
      return await forbidden();
    }
    throw error;
  }
}
