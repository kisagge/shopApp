import { z } from 'zod';
import { ORDER_STATUS } from '@shop/core';
import { getActor } from '@shop/auth/session';
import { NextResponse } from 'next/server';
import { transitionOrder, TransitionError } from '~/lib/admin/transition-order';
import { refundOrder, RefundError } from '~/lib/admin/refund-order';
import { recordAudit } from '~/lib/audit';
import { validationFailed } from '~/lib/i18n/validation';

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
    return NextResponse.json({ code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: 'INVALID_JSON', message: '요청 본문을 읽을 수 없습니다.' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return validationFailed(parsed.error);
  }

  const { orderNo } = await params;

  try {
    /**
     * 환불만 다른 길로 보낸다.
     *
     * 화면에서는 같은 상태 선택으로 보이지만, 이것만 돈이 실제로 나간다.
     * transitionOrder 는 REFUNDED 를 아예 거절하므로 여기서 갈라 주지 않으면
     * 환불이 되지 않는다 — 조용히 상태만 바뀌던 예전으로 돌아가지 않도록
     * 일부러 그렇게 막아 뒀다.
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

      return NextResponse.json(refund);
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
    if (error instanceof TransitionError || error instanceof RefundError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    throw error;
  }
}
