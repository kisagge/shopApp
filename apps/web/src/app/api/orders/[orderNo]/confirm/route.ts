import { confirmPaymentRequestSchema } from '@shop/contract';
import { getSessionUser } from '@shop/auth/session';
import { PaymentError } from '@shop/core';
import { NextResponse } from 'next/server';
import { confirmPayment, ConfirmError } from '~/lib/orders/confirm-payment';
import { unauthorized } from '~/lib/api/respond';
import { readBody } from '~/lib/api/read-body';

/** 결제 승인. 결제창이 콜백한 paymentKey 를 받아 PG 에 승인을 요청한다. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderNo: string }> },
): Promise<NextResponse> {
  const user = await getSessionUser(request.headers);
  if (!user) {
    return await unauthorized();
  }

  const parsed = await readBody(request, confirmPaymentRequestSchema);
  if (!parsed.ok) return parsed.response;

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
