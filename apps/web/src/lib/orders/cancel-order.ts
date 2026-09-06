import 'server-only';
import { prisma } from '@shop/db';
import {
  isCancellableByCustomer, transition, canRefundOrder, ORDER_STATUS_LABEL,
  type Actor, type PaymentGateway,
} from '@shop/core';
import { getPaymentGateway } from '~/lib/payments';
import { recordServerEvent } from '~/lib/analytics/server';

export class CancelError extends Error {
  constructor(readonly code: string, message: string, readonly status = 409) {
    super(message);
    this.name = 'CancelError';
  }
}

export interface CancelResult {
  readonly orderNo: string;
  readonly status: string;
  readonly refunded: number;
}

/**
 * 주문 취소와 환불.
 *
 * 주문을 되돌린다는 건 **주문 생성이 한 일을 전부 역순으로 푸는 것**이다.
 * 재고를 되돌리고, 쓴 포인트를 돌려주고, 쿠폰을 되살린다. 하나라도 빠뜨리면
 * 고객이 손해를 보거나(포인트) 재고가 영영 잠긴다.
 *
 * 고객은 출고 전까지만 스스로 취소할 수 있다. 그 뒤는 반품 절차다.
 * 운영진은 order:refund 권한으로 언제든 취소할 수 있다.
 */
export async function cancelOrder(
  orderNo: string,
  actor: Actor,
  reason: string,
  /**
   * 결제 취소를 부를 곳.
   *
   * **기본값으로 미리 만들지 않는다.** 기본 인자는 부를 때마다 평가되므로,
   * 결제가 잡히지 않은 주문을 취소할 때도 게이트웨이가 만들어졌다 — 그리고
   * 결제 키가 없는 배포에서는 그 자리에서 던졌다. 돈이 오간 적 없는 주문을
   * 되돌리는 데 결제 설정이 필요할 이유가 없다.
   *
   * 실제로 미결제 주문 취소가 통째로 500 이었고, **결제 대기 재고를 푸는
   * 배치도 같은 이유로 한 건도 못 풀었을 것**이다.
   */
  gateway?: PaymentGateway,
): Promise<CancelResult> {
  const isStaff = canRefundOrder(actor);

  const order = await prisma.order.findFirst({
    where: { orderNo, ...(isStaff ? {} : { userId: actor.id }) },
    select: {
      id: true, orderNo: true, status: true, userId: true, browserSessionId: true,
      pointsUsed: true, payable: true, usedCouponId: true,
      items: { select: { variantId: true, quantity: true } },
      payment: { select: { id: true, status: true, pgPaymentKey: true, refundedAmount: true } },
    },
  });
  if (!order) throw new CancelError('ORDER_NOT_FOUND', '주문을 찾을 수 없습니다.', 404);

  // 이미 끝난 주문과 아직 진행 중인데 취소할 수 없는 주문은 다른 이야기다.
  // 둘을 한 메시지로 뭉뚱그리면 "출고된 주문은 취소할 수 없습니다" 가
  // 이미 환불된 주문에도 뜬다.
  const status = order.status;
  if (status === 'CANCELLED' || status === 'REFUNDED') {
    throw new CancelError(
      'ALREADY_CANCELLED',
      `이미 ${ORDER_STATUS_LABEL[status]}된 주문입니다.`,
    );
  }
  if (status === 'CONFIRMED') {
    throw new CancelError('ALREADY_CONFIRMED', '구매확정된 주문은 취소할 수 없습니다.');
  }
  if (!isStaff && !isCancellableByCustomer(status)) {
    throw new CancelError(
      'NOT_CANCELLABLE',
      '출고된 주문은 직접 취소할 수 없습니다. 반품 절차로 진행해 주세요.',
    );
  }

  // 상태머신이 허용하지 않는 전이는 여기서 막힌다
  const nextStatus = transition(order.status, 'CANCELLED');

  // ── PG 취소는 트랜잭션 밖에서. 실제로 돈이 나간 경우에만 부른다.
  let refunded = 0;
  const captured = order.payment?.status === 'DONE' || order.payment?.status === 'PARTIAL_CANCELED';
  if (captured && order.payment?.pgPaymentKey) {
    // 여기서야 필요하다. 여기까지 오지 않으면 만들지 않는다.
    const result = await (gateway ?? getPaymentGateway()).cancel({
      paymentKey: order.payment.pgPaymentKey,
      amount: null, // 전액 취소
      reason,
      // 같은 취소를 두 번 보내도 한 번만 처리되게 한다. 재시도로 두 번
      // 환불되는 사고를 막는 유일한 장치다.
      idempotencyKey: `cancel-${order.orderNo}`,
    });
    refunded = order.payable;
    void result;
  }

  await prisma.$transaction(async (tx) => {
    // 조건부 UPDATE — 그 사이 다른 요청이 먼저 취소했으면 0건이 나온다
    const { count } = await tx.order.updateMany({
      where: { id: order.id, status: order.status },
      data: { status: nextStatus, canceledAt: new Date() },
    });
    if (count === 0) throw new CancelError('ALREADY_PROCESSED', '이미 처리된 주문입니다.');

    await tx.orderItem.updateMany({ where: { orderId: order.id }, data: { status: nextStatus } });

    // ── 재고 복원. 잠긴 재고를 풀지 않으면 팔 수 있는 물건이 영영 묶인다.
    for (const item of order.items) {
      await tx.productVariant.updateMany({
        where: { id: item.variantId },
        data: { stock: { increment: item.quantity } },
      });
    }

    // ── 포인트 복원. 잔액만 올리지 않고 원장에도 남긴다.
    if (order.pointsUsed > 0) {
      await tx.user.update({
        where: { id: order.userId },
        data: { pointBalance: { increment: order.pointsUsed } },
      });
      await tx.pointTransaction.create({
        data: {
          userId: order.userId,
          amount: order.pointsUsed,
          reason: 'CANCEL_REFUND',
          orderId: order.id,
          note: `주문 ${order.orderNo} 취소`,
        },
      });
    }

    // ── 쿠폰 복원. 취소했는데 쿠폰이 소멸되면 고객이 손해를 본다.
    if (order.usedCouponId) {
      await tx.userCoupon.update({
        where: { id: order.usedCouponId },
        data: { usedAt: null },
      });
    }

    if (order.payment) {
      await tx.payment.update({
        where: { id: order.payment.id },
        data: {
          status: captured ? 'CANCELED' : 'ABORTED',
          refundedAmount: order.payment.refundedAmount + refunded,
          canceledAt: new Date(),
        },
      });
    }

    await tx.orderStatusLog.create({
      data: {
        orderId: order.id, from: order.status, to: nextStatus,
        actor: actor.id, note: reason,
      },
    });

    // 실제로 환불이 일어났으면 REFUNDED 까지 옮긴다
    if (refunded > 0) {
      const after = transition(nextStatus, 'REFUNDED');
      await tx.order.update({ where: { id: order.id }, data: { status: after } });
      await tx.orderStatusLog.create({
        data: { orderId: order.id, from: nextStatus, to: after, actor: 'system', note: '환불 완료' },
      });
    }
  });

  if (refunded > 0) {
    await recordServerEvent({
      name: 'refund',
      occurredAt: new Date(),
      sessionId: order.browserSessionId ?? `order-${order.orderNo}`,
      anonymousId: order.browserSessionId ?? `order-${order.orderNo}`,
      userId: order.userId,
      path: '/order',
      productId: null, variantId: null,
      orderId: order.orderNo,
      merchantId: null,
      value: refunded,
      quantity: order.items.reduce((sum, i) => sum + i.quantity, 0),
      props: { reason, byStaff: isStaff },
    });
  }

  return {
    orderNo: order.orderNo,
    status: refunded > 0 ? 'REFUNDED' : nextStatus,
    refunded,
  };
}
