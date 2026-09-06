import { NextResponse } from 'next/server';
import { enforceRateLimit } from '~/lib/rate-limit';
import { getSessionUser } from '@shop/auth/session';
import { claimCouponSchema } from '@shop/contract';
import { claimCouponByCode, CouponError } from '~/lib/admin/manage-coupon';
import { unauthorized } from '~/lib/api/respond';
import { validationFailed } from '~/lib/i18n/validation';

/** 고객이 코드를 넣어 쿠폰을 받는다 */
export async function POST(request: Request): Promise<NextResponse> {
  const user = await getSessionUser(request.headers);
  if (!user) {
    return await unauthorized();
  }

  // 로그인 필수 창구라 사용자 id 로 센다
  const limited = await enforceRateLimit('coupon', request, user.id);
  if (limited) return limited;

  const parsed = claimCouponSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    // 문구는 계약의 열쇠에서 나오고, 번역은 이 응답을 만들 때 한다
    return validationFailed(parsed.error);
  }

  try {
    return NextResponse.json(await claimCouponByCode(parsed.data.code, user.id));
  } catch (error) {
    if (error instanceof CouponError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    throw error;
  }
}
