import { NextResponse } from 'next/server';
import { getActor } from '@shop/auth/session';
import { updateCouponSchema } from '@shop/contract';
import { ForbiddenError } from '@shop/core';
import { updateCoupon, CouponError } from '~/lib/admin/manage-coupon';
import { recordAudit } from '~/lib/audit';
import { unauthorized } from '~/lib/api/respond';
import { validationFailed } from '~/lib/i18n/validation';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return await unauthorized();
  }

  const parsed = updateCouponSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    // 문구는 계약의 열쇠에서 나오고, 번역은 이 응답을 만들 때 한다
    return validationFailed(parsed.error);
  }

  const { id } = await params;

  try {
    const coupon = await updateCoupon(actor, id, parsed.data);
    await recordAudit({
      actor,
      action: 'coupon.update',
      targetType: 'coupon',
      targetId: coupon.code,
      after: parsed.data,
      request,
    });
    return NextResponse.json({ coupon });
  } catch (error) {
    if (error instanceof CouponError) {
      return NextResponse.json(
        { code: error.code, message: error.message, fields: error.fields },
        { status: error.status },
      );
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ code: 'FORBIDDEN', message: error.message }, { status: 403 });
    }
    throw error;
  }
}
