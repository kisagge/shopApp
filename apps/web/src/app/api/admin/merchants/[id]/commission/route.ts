import { NextResponse } from 'next/server';
import { merchantCommissionSchema } from '@shop/contract';
import { ForbiddenError } from '@shop/core';
import { getActor } from '@shop/auth/session';
import { MerchantSettingsError, updateMerchantCommission } from '~/lib/admin/merchant-settings';
import { recordAudit } from '~/lib/audit';
import { validationFailed } from '~/lib/i18n/validation';
import { forbidden, invalidJson, unauthorized } from '~/lib/api/respond';

/**
 * 수수료율 변경 — **슈퍼관리자만**(merchant:approve).
 *
 * 연락처·계좌와 창구를 나눈 이유가 여기 있다. 요율은 플랫폼이 가져가는 몫이라 입점을 승인하는 사람이 정한다 —
 * 관리자가 요율을 내리고 지급까지 집행할 수 있으면 권한을 나눠 둔 뜻이 없어진다.
 */
export async function PUT(
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

  const parsed = merchantCommissionSchema.safeParse(body);
  if (!parsed.success) {
    return validationFailed(parsed.error);
  }

  const { id } = await params;

  try {
    const result = await updateMerchantCommission(actor, id, parsed.data);
    await recordAudit({
      actor,
      action: 'merchant.commission',
      targetType: 'merchant',
      targetId: id,
      before: { commissionPercent: result.before },
      // 사유까지 남긴다 — 숫자만 바뀐 기록은 왜 그렇게 됐는지 답하지 못한다
      after: { commissionPercent: result.after, reason: result.reason },
      request,
    });
    return NextResponse.json({ commissionPercent: result.after });
  } catch (error) {
    if (error instanceof MerchantSettingsError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    if (error instanceof ForbiddenError) {
      return await forbidden();
    }
    throw error;
  }
}
