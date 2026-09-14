import 'server-only';
import { prisma } from '@shop/db';
import { statusBeforeReturn, transition, type Actor, type CarrierCode } from '@shop/core';
import { loadForResolve, ReturnError } from './return-request';

/**
 * 교환 — 회수를 확인하고 바꾼 옵션을 보낸다.
 *
 * **돈은 움직이지 않는다.** 그래서 환불 권한(order:refund)이 아니라 반품 처리 권한(return:resolve)으로 한다 — 물건을
 * 받고 새 물건을 내보내는 곳이 가맹점 창고다. 섞인 가맹점 신청은 운영진 몫인 것도 반품과 같다(loadForResolve).
 *
 * 한 번에 일어나는 일:
 * - 돌아온 옵션의 재고를 늘린다(바꿀 옵션은 신청할 때 이미 잡아 뒀다)
 * - 주문 줄이 **바꾼 옵션**을 가리키게 한다 — 손님이 지금 가진 물건이다. 후기·재주문이 그것을 봐야 한다.
 *   처음 산 옵션은 교환 줄(ReturnExchangeLine)에 남는다. 값은 같으므로 금액·정산은 그대로다.
 * - 줄과 주문을 신청 전 자리로 되돌린다(반려와 같은 statusBeforeReturn) — 새 물건이 가는 중이지만 확정·기한 계산을
 *   다시 시작하지 않는다. 날짜를 새로 쓰면 이미 지급한 달의 매출이 옮겨간다.
 * - 교환 송장을 신청에 적는다. 주문의 첫 송장은 덮지 않는다.
 */
export async function completeExchange(
  orderNo: string,
  input: { carrier: CarrierCode; trackingNumber: string },
  actor: Actor,
  now: Date = new Date(),
): Promise<{ orderNo: string; orderStatus: string; exchanged: number }> {
  const { order, request } = await loadForResolve(orderNo, actor);
  if (request.type !== 'EXCHANGE') {
    throw new ReturnError('NOT_EXCHANGE', '교환 신청이 아닙니다. 반품은 회수 확인 · 환불로 처리합니다.');
  }
  if (request.status !== 'APPROVED') {
    throw new ReturnError('NOT_APPROVED', request.status === 'COMPLETED' ? '이미 교환 상품을 보낸 신청입니다.' : '승인한 신청만 교환 상품을 보낼 수 있습니다.');
  }
  if (request.exchangeLines.length === 0) throw new ReturnError('NO_ITEMS', '교환할 상품이 없습니다.');

  const trackingNumber = input.trackingNumber.replace(/\D/g, '');
  const back = transition(order.status, statusBeforeReturn(order));

  await prisma.$transaction(async (tx) => {
    // 두 사람이 동시에 눌러도 한 번만 — 신청을 먼저 조건부로 닫는다
    const { count } = await tx.returnRequest.updateMany({
      where: { id: request.id, status: 'APPROVED' },
      data: {
        status: 'COMPLETED', resolvedAt: now, resolvedBy: actor.id,
        reshipCarrier: input.carrier, reshipTrackingNumber: trackingNumber, reshippedAt: now,
        ...(request.receivedAt ? {} : { receivedAt: now, receivedBy: actor.id }),
      },
    });
    if (count === 0) throw new ReturnError('ALREADY_PROCESSED', '이미 처리된 신청입니다.');

    for (const line of request.exchangeLines) {
      // 돌아온 물건
      await tx.productVariant.updateMany({
        where: { id: line.fromVariantId },
        data: { stock: { increment: line.quantity } },
      });
      const { count: moved } = await tx.orderItem.updateMany({
        where: { id: line.orderItemId, orderId: order.id, status: 'RETURN_REQUESTED', canceledAt: null },
        data: { variantId: line.toVariantId, optionLabel: line.toOptionLabel, status: back },
      });
      if (moved === 0) throw new ReturnError('ALREADY_PROCESSED', '이미 처리된 상품입니다.');
    }

    const { count: orderMoved } = await tx.order.updateMany({
      where: { id: order.id, status: order.status },
      data: { status: back },
    });
    if (orderMoved === 0) throw new ReturnError('ALREADY_PROCESSED', '이미 처리된 주문입니다.');

    await tx.orderStatusLog.create({
      data: {
        orderId: order.id, from: order.status, to: back, actor: actor.id,
        note: `교환 상품 발송 ${request.exchangeLines.length}건 — ${input.carrier} ${trackingNumber}`,
      },
    });
  });

  return { orderNo: order.orderNo, orderStatus: back, exchanged: request.exchangeLines.length };
}
