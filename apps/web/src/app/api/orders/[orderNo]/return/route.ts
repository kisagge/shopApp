import { NextResponse } from 'next/server';
import { getSessionUser } from '@shop/auth/session';
import { returnRequestSchema } from '@shop/contract';
import { requestReturn, ReturnError } from '~/lib/orders/return-request';
import { unauthorized } from '~/lib/api/respond';
import { validationFailed } from '~/lib/i18n/validation';

/** 고객의 반품·교환 신청 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderNo: string }> },
): Promise<NextResponse> {
  const user = await getSessionUser(request.headers);
  if (!user) {
    return await unauthorized();
  }

  const parsed = returnRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    // 문구는 계약의 열쇠에서 나오고, 번역은 이 응답을 만들 때 한다
    return validationFailed(parsed.error);
  }

  const { orderNo } = await params;

  try {
    return NextResponse.json(await requestReturn(orderNo, parsed.data, user));
  } catch (error) {
    if (error instanceof ReturnError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    throw error;
  }
}
