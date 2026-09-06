import { NextResponse } from 'next/server';
import { getActor } from '@shop/auth/session';
import { issueCouponSchema } from '@shop/contract';
import { ForbiddenError } from '@shop/core';
import { issueCouponToUsers, CouponError } from '~/lib/admin/manage-coupon';
import { recordAudit } from '~/lib/audit';
import { unauthorized, invalidJson } from '~/lib/api/respond';
import { validationFailed } from '~/lib/i18n/validation';

/**
 * 고른 회원들에게 쿠폰을 지급한다.
 *
 * **돈이 걸린 동작이라 남긴다.** 누가 어떤 쿠폰을 몇 명에게 줬는지가
 * 감사 로그에 있어야 나중에 설명할 수 있다 — 쿠폰을 만드는 것과 같은 이유다.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return await unauthorized();
  }

  const body = await request.json().catch(() => null);
  if (body === null) return await invalidJson();

  const parsed = issueCouponSchema.safeParse(body);
  if (!parsed.success) {
    return validationFailed(parsed.error);
  }

  const { id } = await params;

  try {
    const summary = await issueCouponToUsers(actor, id, parsed.data.userIds);

    await recordAudit({
      actor,
      action: 'coupon.issue',
      targetType: 'coupon',
      targetId: id,
      // 누구에게 줬는지가 아니라 **몇 명에게 줬는지**를 남긴다. 명단을 통째로
      // 박아 두면 감사 로그가 개인 정보 저장소가 된다.
      after: { requested: parsed.data.userIds.length, ...summary },
      request,
    });

    return NextResponse.json(summary);
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
