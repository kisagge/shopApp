import { cancelOrderRequestSchema } from '@shop/contract';
import { getActor } from '@shop/auth/session';
import { PaymentError } from '@shop/core';
import { NextResponse } from 'next/server';
import { notifyAfterSale } from '~/lib/orders/notify-after-sale';
import { revalidateCatalog } from '~/lib/cache';
import { cancelOrder, CancelError } from '~/lib/orders/cancel-order';
import { recordAudit } from '~/lib/audit';
import { validationFailed } from '~/lib/i18n/validation';
import { invalidJson, unauthorized } from '~/lib/api/respond';

/** 주문 취소·환불. 고객은 출고 전까지, 운영진은 order:refund 권한으로. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderNo: string }> },
): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return await unauthorized();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return await invalidJson();
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

    // 취소하면 재고가 돌아온다. 품절로 보이던 것이 다시 팔려야 한다.
    revalidateCatalog();

    // 스스로 취소했으니 알림함에는 남기지 않고 메일만 간다(core recordsNotification)
    await notifyAfterSale({
      kind: 'ORDER_CANCELLED', orderNo, actorId: actor.id, reason: parsed.data.reason,
      money: { refunded: result.refunded, pointsReturned: result.pointsReturned, shippingDeducted: 0 },
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
