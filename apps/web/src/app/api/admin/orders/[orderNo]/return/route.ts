import { NextResponse } from 'next/server';
import { getActor } from '@shop/auth/session';
import { resolveReturnSchema } from '@shop/contract';
import { receiveReturn, resolveReturn, ReturnError } from '~/lib/orders/return-request';
import { completeReturn } from '~/lib/orders/complete-return';
import { revalidateCatalog } from '~/lib/cache';
import { PaymentError } from '@shop/core';
import { recordAudit } from '~/lib/audit';
import { validationFailed } from '~/lib/i18n/validation';
import { unauthorized } from '~/lib/api/respond';

/** 운영진의 반품 승인·반려, 그리고 회수 확인 뒤 환불 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderNo: string }> },
): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return await unauthorized();
  }

  const parsed = resolveReturnSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return validationFailed(parsed.error);
  }

  const { orderNo } = await params;

  try {
    if (parsed.data.action === 'COMPLETE') {
      const done = await completeReturn(orderNo, actor);
      // 돈이 나가는 동작이다. 누가 얼마를 돌려줬는지 남긴다
      await recordAudit({
        actor,
        action: 'order.completeReturn',
        targetType: 'order',
        targetId: orderNo,
        after: done,
        request,
      });
      // 돌아온 물건이 다시 팔려야 한다
      revalidateCatalog();
      return NextResponse.json(done);
    }

    if (parsed.data.action === 'RECEIVE') {
      const received = await receiveReturn(orderNo, actor);
      // 운영진이 이 기록을 보고 환불한다. 누가 도착을 확인했는지가 곧 근거다
      await recordAudit({
        actor,
        action: 'order.receiveReturn',
        targetType: 'order',
        targetId: orderNo,
        after: received,
        request,
      });
      return NextResponse.json(received);
    }

    const result = await resolveReturn(orderNo, parsed.data, actor);

    // 돈과 재고가 걸린 판단이라 누가 언제 했는지 남긴다
    await recordAudit({
      actor,
      action: 'order.resolveReturn',
      targetType: 'order',
      targetId: result.orderNo,
      after: result,
      request,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ReturnError) {
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
