import { NextResponse } from 'next/server';
import { createInquirySchema } from '@shop/contract';
import { getSessionUser } from '@shop/auth/session';
import { enforceRateLimit } from '~/lib/rate-limit';
import { createInquiry, InquiryError } from '~/lib/inquiry/write';
import { validationFailed } from '~/lib/i18n/validation';

/**
 * 상품 문의 작성.
 *
 * **구매 이력을 보지 않는다.** 사기 전에 묻는 자리라는 것이 리뷰와 다른
 * 점이다. 로그인만 요구한다 — 익명으로 열면 누구에게 답해야 하는지 알 수
 * 없고, 답이 왔는지 알려 줄 수도 없다.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const user = await getSessionUser(request.headers);
  if (!user) {
    return NextResponse.json({ code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' }, { status: 401 });
  }

  // 본문을 읽기 전에 센다 — 뒤에 두면 형식이 틀린 요청이 세어지지 않는다
  const limited = await enforceRateLimit('inquiry', request, user.id);
  if (limited) return limited;

  const parsed = createInquirySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return validationFailed(parsed.error);
  }

  try {
    return NextResponse.json(await createInquiry(user.id, parsed.data), { status: 201 });
  } catch (error) {
    if (error instanceof InquiryError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    throw error;
  }
}
