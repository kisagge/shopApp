import { z } from 'zod';
import { ORDER_STATUS } from '@shop/core';
import { getActor } from '@shop/auth/session';
import { NextResponse } from 'next/server';
import { transitionOrder, TransitionError } from '~/lib/admin/transition-order';
import { recordAudit } from '~/lib/audit';

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
    return NextResponse.json(
      { code: 'VALIDATION_FAILED', message: '변경할 상태를 확인해 주세요.' },
      { status: 400 },
    );
  }

  const { orderNo } = await params;

  try {
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
    if (error instanceof TransitionError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    throw error;
  }
}
