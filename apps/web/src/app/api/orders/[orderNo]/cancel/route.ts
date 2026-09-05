import { cancelOrderRequestSchema } from '@shop/contract';
import { getActor } from '@shop/auth/session';
import { PaymentError } from '@shop/core';
import { NextResponse } from 'next/server';
import { cancelOrder, CancelError } from '~/lib/orders/cancel-order';
import { recordAudit } from '~/lib/audit';
import { validationFailed } from '~/lib/i18n/validation';

/** 주문 취소·환불. 고객은 출고 전까지, 운영진은 order:refund 권한으로. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderNo: string }> },
): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return NextResponse.json({ code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: 'INVALID_JSON', message: '요청 본문을 읽을 수 없습니다.' }, { status: 400 });
  }

  const parsed = cancelOrderRequestSchema.safeParse(body);
  if (!parsed.success) {
    return validationFailed(parsed.error);
  }

  const { orderNo } = await params;

  try {
    const result = await cancelOrder(orderNo, actor, parsed.data.reason);

    // 돈이 오가는 동작이라 누가 했는지 반드시 남긴다
    await recordAudit({
      actor,
      action: 'order.cancel',
      targetType: 'order',
      targetId: orderNo,
      after: { status: result.status, refunded: result.refunded, reason: parsed.data.reason },
      request,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CancelError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    if (error instanceof PaymentError) {
      return NextResponse.json(
        { code: error.code, message: error.message, retryable: error.retryable },
        { status: 502 },
      );
    }
    throw error;
  }
}
