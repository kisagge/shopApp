import { z } from 'zod';
import { ORDER_STATUS } from '@shop/core';
import { getActor } from '@shop/auth/session';
import { NextResponse } from 'next/server';
import { notifyAfterSale } from '~/lib/orders/notify-after-sale';
import { transitionOrder, TransitionError } from '~/lib/admin/transition-order';
import { refundOrder, RefundError } from '~/lib/admin/refund-order';
import { cancelOrder, CancelError } from '~/lib/orders/cancel-order';
import { revalidateCatalog } from '~/lib/cache';
import { recordAudit } from '~/lib/audit';
import { validationFailed } from '~/lib/i18n/validation';
import { invalidJson, unauthorized } from '~/lib/api/respond';

const bodySchema = z.object({
  to: z.enum(ORDER_STATUS),
  note: z.string().trim().max(200).optional(),
});

/** 어드민 주문 상태 변경. 권한과 가맹점 범위를 모두 확인한다. */
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

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return validationFailed(parsed.error);
  }

  const { orderNo } = await params;

  try {
    /**
     * 환불과 취소는 다른 길로 보낸다.
     *
     * 화면에서는 같은 상태 선택으로 보이지만, 이 둘만 주문이 한 일을 되돌린다.
     * transitionOrder 는 REFUNDED·CANCELLED 를 아예 거절하므로 여기서 갈라
     * 주지 않으면 되지 않는다 — 조용히 상태만 바뀌던 예전으로 돌아가지
     * 않도록 일부러 그렇게 막아 뒀다.
     */
    if (parsed.data.to === 'REFUNDED') {
      const refund = await refundOrder(orderNo, actor, parsed.data.note ?? '어드민 환불');

      await recordAudit({
        actor,
        action: 'order.refund',
        targetType: 'order',
        targetId: orderNo,
        after: {
          orderStatus: refund.orderStatus,
          refunded: refund.refunded,
          stockRestored: refund.stockRestored,
          pointsReturned: refund.pointsReturned,
          note: parsed.data.note,
        },
        request,
      });

      // 환불하면 재고가 돌아온다. 품절로 보이던 것이 다시 팔려야 한다.
      if (refund.stockRestored) revalidateCatalog();

      await notifyAfterSale({
        kind: 'REFUND_COMPLETED', orderNo, actorId: actor.id,
        money: { refunded: refund.refunded, pointsReturned: refund.pointsReturned, shippingDeducted: 0 },
      });

      return NextResponse.json(refund);
    }

    /**
     * 취소는 재고·포인트·쿠폰을 되돌리고 잡힌 돈이 있으면 PG 취소까지
     * 보낸다. 상태만 바꾸는 길로 가면 그중 아무것도 일어나지 않는다.
     */
    if (parsed.data.to === 'CANCELLED') {
      const cancel = await cancelOrder(orderNo, actor, parsed.data.note ?? '어드민 취소');

      await recordAudit({
        actor,
        action: 'order.cancel',
        targetType: 'order',
        targetId: orderNo,
        after: {
          orderStatus: cancel.status,
          refunded: cancel.refunded,
          note: parsed.data.note,
        },
        request,
      });

      // 취소하면 재고가 돌아온다. 품절로 보이던 것이 다시 팔려야 한다.
      revalidateCatalog();

      // 운영 메모(note)는 손님에게 보이지 않는다(core showsReason)
      await notifyAfterSale({
        kind: 'ORDER_CANCELLED', orderNo, actorId: actor.id, reason: parsed.data.note,
        money: { refunded: cancel.refunded, pointsReturned: cancel.pointsReturned, shippingDeducted: 0 },
      });

      return NextResponse.json(cancel);
    }

    const result = await transitionOrder(orderNo, parsed.data.to, actor, parsed.data.note);

    await recordAudit({
      actor,
      action: `order.status.${parsed.data.to.toLowerCase()}`,
      targetType: 'order',
      targetId: orderNo,
      after: {
        orderStatus: result.orderStatus,
        itemsMoved: result.itemsMoved,
        waitingForOthers: result.waitingForOthers,
        note: parsed.data.note,
      },
      request,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (
      error instanceof TransitionError ||
      error instanceof RefundError ||
      error instanceof CancelError
    ) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    throw error;
  }
}
