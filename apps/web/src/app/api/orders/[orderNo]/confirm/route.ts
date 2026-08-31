import { confirmPaymentRequestSchema } from '@shop/contract';
import { getSessionUser } from '@shop/auth/session';
import { PaymentError } from '@shop/core';
import { NextResponse } from 'next/server';
import { confirmPayment, ConfirmError } from '~/lib/orders/confirm-payment';

/** 결제 승인. 결제창이 콜백한 paymentKey 를 받아 PG 에 승인을 요청한다. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderNo: string }> },
): Promise<NextResponse> {
  const user = await getSessionUser(request.headers);
  if (!user) {
    return NextResponse.json({ code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: 'INVALID_JSON', message: '요청 본문을 읽을 수 없습니다.' }, { status: 400 });
  }

  const parsed = confirmPaymentRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { code: 'VALIDATION_FAILED', message: '결제 정보를 확인해 주세요.' },
      { status: 400 },
    );
  }

  const { orderNo } = await params;

  try {
    return NextResponse.json(
      await confirmPayment({ orderNo, ...parsed.data }, { id: user.id }),
    );
  } catch (error) {
    if (error instanceof ConfirmError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    if (error instanceof PaymentError) {
      // 재시도해도 되는 오류인지 화면이 알아야 한다
      return NextResponse.json(
        { code: error.code, message: error.message, retryable: error.retryable },
        { status: 402 },
      );
    }
    throw error;
  }
}
