import { NextResponse } from 'next/server';
import { enforceRateLimit } from '~/lib/rate-limit';
import { getSessionUser } from '@shop/auth/session';
import { downloadCoupon } from '~/lib/coupons/downloadable';
import { CouponError } from '~/lib/admin/manage-coupon';
import { unauthorized } from '~/lib/api/respond';

/** 받기 단추로 쿠폰을 받는다. 코드 입력과 같은 제한(coupon)을 건다 — id 를 바꿔 가며 두드리는 것을 막는다 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getSessionUser(request.headers);
  if (!user) {
    return await unauthorized();
  }
  const limited = await enforceRateLimit('coupon', request, user.id);
  if (limited) return limited;

  const { id } = await params;
  try {
    return NextResponse.json(await downloadCoupon(id, user.id), { status: 201 });
  } catch (error) {
    if (error instanceof CouponError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    throw error;
  }
}
