import { cancelItemsRequestSchema } from '@shop/contract';
import { getActor } from '@shop/auth/session';
import { PaymentError } from '@shop/core';
import { NextResponse } from 'next/server';
import { notifyAfterSale } from '~/lib/orders/notify-after-sale';
import { revalidateCatalog } from '~/lib/cache';
import { cancelOrderItems, previewCancelItems, CancelItemsError } from '~/lib/orders/cancel-items';
import { CancelError } from '~/lib/orders/cancel-order';
import { recordAudit } from '~/lib/audit';
import { validationFailed } from '~/lib/i18n/validation';
import { invalidJson, unauthorized } from '~/lib/api/respond';

/**
 * 일부 상품 취소·환불. 손님은 결제완료까지, 운영진은 출고 전까지.
 *
 * 전액 취소와 같은 창구 구조다(누가 부르든 한 곳). 운영진인지는 함수가 권한으로 가르고,
 * 손님은 자기 주문만 찾는다. 남는 상품이 없게 고르면 주문 전체 취소로 넘어간다.
 */
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

  const parsed = cancelItemsRequestSchema.safeParse(body);
  if (!parsed.success) {
    return validationFailed(parsed.error);
  }

  const { orderNo } = await params;
  const { itemIds, reason, preview } = parsed.data;

  try {
    if (preview) {
      return NextResponse.json(await previewCancelItems(orderNo, itemIds, actor));
    }

    const result = await cancelOrderItems(orderNo, itemIds, actor, reason);

    // 돈이 오가는 동작이라 누가 했는지 반드시 남긴다
    await recordAudit({
      actor,
      action: result.kind === 'full' ? 'order.cancel' : 'order.cancelItems',
      targetType: 'order',
      targetId: orderNo,
      after: { ...result, itemIds, reason },
      request,
    });

    // 취소한 줄의 재고가 돌아온다. 품절로 보이던 것이 다시 팔려야 한다.
    revalidateCatalog();

    // 운영진이 운영 화면에서 줄을 취소해도 이 창구다 — 누가 했는지로 알림함에 남길지 가른다
    await notifyAfterSale({
      kind: 'ORDER_CANCELLED', orderNo, actorId: actor.id, reason,
      itemIds: result.kind === 'full' ? undefined : itemIds,
      money: { refunded: result.refunded, pointsReturned: result.pointsReturned, shippingDeducted: result.shippingDeducted },
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CancelItemsError || error instanceof CancelError) {
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
