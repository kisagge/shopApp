import { NextResponse } from 'next/server';
import { getActor } from '@shop/auth/session';
import { updateCouponSchema } from '@shop/contract';
import { ForbiddenError } from '@shop/core';
import { updateCoupon, CouponError } from '~/lib/admin/manage-coupon';
import { recordAudit } from '~/lib/audit';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return NextResponse.json({ code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' }, { status: 401 });
  }

  const parsed = updateCouponSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ code: 'INVALID_INPUT', message: '입력을 확인해 주세요.' }, { status: 400 });
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
