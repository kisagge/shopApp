import { NextResponse } from 'next/server';
import { enforceRateLimit } from '~/lib/rate-limit';
import { getSessionUser } from '@shop/auth/session';
import { claimCouponSchema } from '@shop/contract';
import { claimCouponByCode, CouponError } from '~/lib/admin/manage-coupon';

/** 고객이 코드를 넣어 쿠폰을 받는다 */
export async function POST(request: Request): Promise<NextResponse> {
  const user = await getSessionUser(request.headers);
  if (!user) {
    return NextResponse.json({ code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' }, { status: 401 });
  }

  // 로그인 필수 창구라 사용자 id 로 센다
  const limited = await enforceRateLimit('coupon', request, user.id);
  if (limited) return limited;

  const parsed = claimCouponSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { code: 'INVALID_INPUT', message: '쿠폰 코드를 입력해 주세요.' },
      { status: 400 },
    );
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
