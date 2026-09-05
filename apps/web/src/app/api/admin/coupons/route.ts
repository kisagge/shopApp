import { NextResponse } from 'next/server';
import { getActor } from '@shop/auth/session';
import { createCouponSchema } from '@shop/contract';
import { ForbiddenError } from '@shop/core';
import { listCoupons, createCoupon, CouponError } from '~/lib/admin/manage-coupon';
import { recordAudit } from '~/lib/audit';
import { validationFailed } from '~/lib/i18n/validation';

export async function GET(request: Request): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return NextResponse.json({ code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' }, { status: 401 });
  }
  try {
    return NextResponse.json({ coupons: await listCoupons(actor) });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ code: 'FORBIDDEN', message: error.message }, { status: 403 });
    }
    throw error;
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return NextResponse.json({ code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' }, { status: 401 });
  }

  const parsed = createCouponSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return validationFailed(parsed.error);
  }

  try {
    const coupon = await createCoupon(actor, parsed.data);

    // 돈이 걸린 설정이다. 누가 어떤 조건으로 만들었는지 남긴다.
    await recordAudit({
      actor,
      action: 'coupon.create',
      targetType: 'coupon',
      targetId: coupon.code,
      after: {
        kind: coupon.kind, value: coupon.value, percent: coupon.percent,
        minimumOrder: coupon.minimumOrder, issueLimit: coupon.issueLimit,
      },
      request,
    });

    return NextResponse.json({ coupon }, { status: 201 });
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
