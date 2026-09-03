import { NextResponse } from 'next/server';
import { getSessionUser } from '@shop/auth/session';
import { returnRequestSchema } from '@shop/contract';
import { requestReturn, ReturnError } from '~/lib/orders/return-request';

/** 고객의 반품·교환 신청 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderNo: string }> },
): Promise<NextResponse> {
  const user = await getSessionUser(request.headers);
  if (!user) {
    return NextResponse.json({ code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' }, { status: 401 });
  }

  const parsed = returnRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { code: 'INVALID_INPUT', message: '신청 내용을 확인해 주세요.' },
      { status: 400 },
    );
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
