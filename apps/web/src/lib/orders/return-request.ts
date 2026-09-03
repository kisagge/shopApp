import 'server-only';
import { prisma } from '@shop/db';
import {
  checkReturnEligibility, shippingBorneBy, transition, canRefundOrder,
  RETURN_REASON_LABEL, RETURN_TYPE_LABEL,
  type Actor, type ReturnReason, type ReturnType,
} from '@shop/core';

/**
 * 반품·교환 신청과 처리.
 *
 * 신청은 고객이, 처리는 운영진이 한다.
 *
 * **반송비 부담은 요청으로 받지 않고 사유에서 정한다.** 받아 쓰면 누구나
 * "판매자 부담" 을 보내 반송비를 넘길 수 있다.
 *
 * 교환은 상태머신에 따로 두지 않았다. 상태로 보면 반품과 같은 자리(회수)를
 * 지나고, 그 뒤 재배송은 운영이 새 출고로 처리한다. 자동 재배송까지 넣으려면
 * 상태가 두 갈래로 늘어나는데, 지금 필요한 것은 **접수 창구**다.
 */

export class ReturnError extends Error {
  constructor(readonly code: string, message: string, readonly status = 409) {
    super(message);
    this.name = 'ReturnError';
  }
}

export interface ReturnRequestResult {
  readonly orderNo: string;
  readonly type: ReturnType;
  readonly reason: ReturnReason;
  readonly shippingBorneBy: string;
  readonly orderStatus: string;
}

export async function requestReturn(
  orderNo: string,
  input: { type: ReturnType; reason: ReturnReason; detail?: string | undefined },
  user: { id: string },
  now: Date = new Date(),
): Promise<ReturnRequestResult> {
  // 남의 주문에 신청할 수 없다. userId 를 조회에 함께 건다.
  const order = await prisma.order.findFirst({
    where: { orderNo, userId: user.id },
    select: { id: true, orderNo: true, status: true, deliveredAt: true },
  });
  if (!order) throw new ReturnError('ORDER_NOT_FOUND', '주문을 찾을 수 없습니다.', 404);

  const eligibility = checkReturnEligibility({
    status: order.status,
    deliveredAt: order.deliveredAt,
    reason: input.reason,
    now,
  });
  if (!eligibility.ok) {
    throw new ReturnError(eligibility.code, eligibility.message);
  }

  const borneBy = shippingBorneBy(input.reason);
  const nextStatus = transition(order.status, 'RETURN_REQUESTED');

  await prisma.$transaction(async (tx) => {
    // 조건부 UPDATE. 그 사이 상태가 바뀌었으면 0건이 나온다.
    const { count } = await tx.order.updateMany({
      where: { id: order.id, status: order.status },
      data: { status: nextStatus },
    });
    if (count === 0) throw new ReturnError('ALREADY_PROCESSED', '이미 처리된 주문입니다.');

    await tx.orderItem.updateMany({
      where: { orderId: order.id },
      data: { status: nextStatus },
    });

    await tx.returnRequest.create({
      data: {
        orderId: order.id,
        type: input.type,
        reason: input.reason,
        ...(input.detail ? { detail: input.detail } : {}),
        shippingBorneBy: borneBy,
      },
    });

    await tx.orderStatusLog.create({
      data: {
        orderId: order.id,
        from: order.status,
        to: nextStatus,
        actor: user.id,
        note: `${RETURN_TYPE_LABEL[input.type]} 신청 — ${RETURN_REASON_LABEL[input.reason]}`,
      },
    });
  });

  return {
    orderNo: order.orderNo,
    type: input.type,
    reason: input.reason,
    shippingBorneBy: borneBy,
    orderStatus: nextStatus,
  };
}

/**
 * 운영진이 신청을 처리한다.
 *
 * 승인하면 회수를 기다리는 상태가 되고, 실제 회수·환불은 기존 반품완료·
 * 환불 흐름을 그대로 탄다. **여기서 돈을 움직이지 않는다** — 환불은
 * order:refund 권한이 따로 있는 동작이다.
 *
 * 반려하면 주문을 신청 전 상태로 되돌린다. 되돌리지 않으면 주문이 반품접수에
 * 갇혀서 고객도 운영도 아무것도 못 한다.
 */
export async function resolveReturn(
  orderNo: string,
  input: { action: 'APPROVE' | 'REJECT'; rejectReason?: string | undefined },
  actor: Actor,
): Promise<{ orderNo: string; status: string; orderStatus: string }> {
  if (!canRefundOrder(actor)) {
    throw new ReturnError('FORBIDDEN', '이 동작을 수행할 권한이 없습니다.', 403);
  }

  const order = await prisma.order.findFirst({
    where: { orderNo },
    select: {
      id: true, orderNo: true, status: true,
      returnRequests: {
        orderBy: { requestedAt: 'desc' },
        take: 1,
        select: { id: true, status: true },
      },
    },
  });
  if (!order) throw new ReturnError('ORDER_NOT_FOUND', '주문을 찾을 수 없습니다.', 404);

  const request = order.returnRequests[0];
  if (!request) throw new ReturnError('NO_REQUEST', '반품 신청이 없습니다.', 404);
  if (request.status !== 'REQUESTED') {
    throw new ReturnError('ALREADY_RESOLVED', '이미 처리된 신청입니다.');
  }

  const approve = input.action === 'APPROVE';

  /**
   * 반려하면 배송중으로 되돌린다.
   *
   * 상태머신이 RETURN_REQUESTED 에서 갈 수 있는 곳으로 둔 자리다.
   * 배송완료였더라도 배송중으로 돌아가는데, 그 뒤 다시 배송완료로 갈 수
   * 있으므로 막다른 길은 아니다.
   */
  const nextOrderStatus = approve ? order.status : transition(order.status, 'SHIPPED');

  await prisma.$transaction(async (tx) => {
    await tx.returnRequest.update({
      where: { id: request.id },
      data: {
        status: approve ? 'APPROVED' : 'REJECTED',
        ...(approve ? {} : { rejectReason: input.rejectReason ?? null }),
        resolvedAt: new Date(),
        resolvedBy: actor.id,
      },
    });

    if (approve) return;

    await tx.order.updateMany({
      where: { id: order.id, status: order.status },
      data: { status: nextOrderStatus },
    });
    await tx.orderItem.updateMany({
      where: { orderId: order.id },
      data: { status: nextOrderStatus },
    });
    await tx.orderStatusLog.create({
      data: {
        orderId: order.id,
        from: order.status,
        to: nextOrderStatus,
        actor: actor.id,
        note: `반품 반려 — ${input.rejectReason ?? ''}`,
      },
    });
  });

  return {
    orderNo: order.orderNo,
    status: approve ? 'APPROVED' : 'REJECTED',
    orderStatus: approve ? order.status : nextOrderStatus,
  };
}
