import 'server-only';
import { reclaimPurchaseReward } from '~/lib/orders/reclaim-reward';
import { prisma } from '@shop/db';
import {
  transition, canRefundOrder, remainingRefund, ORDER_STATUS_LABEL,
  type Actor, type PaymentGateway,
} from '@shop/core';
import { getPaymentGateway } from '~/lib/payments';
import { recordServerEvent } from '~/lib/analytics/server';
import { refundedSoFar } from '~/lib/orders/refund-ledger';

export class RefundError extends Error {
  constructor(readonly code: string, message: string, readonly status = 409) {
    super(message);
    this.name = 'RefundError';
  }
}

export interface RefundResult {
  readonly orderNo: string;
  readonly orderStatus: 'REFUNDED';
  readonly refunded: number;
  /** 되돌린 재고 수량 합계. 취소분은 이미 풀려 있어 0이다. */
  readonly stockRestored: number;
  readonly pointsReturned: number;
  /** 구매확정으로 줬다가 되가져온 적립. 확정에 이른 적 없는 주문이면 0 이다. */
  readonly rewardReclaimed: number;
}

/**
 * 환불.
 *
 * **이 파일이 생기기 전까지 환불은 상태만 바꿨다.** 어드민이 주문을
 * 환불완료로 옮겨도 PG 취소가 나가지 않아, 화면에는 환불됐다고 적히고
 * 돈은 그대로 있었다. 반품을 승인해도 마찬가지였다.
 *
 * 그래서 상태 전이(transitionOrder)와 갈라 두었다. 환불은 외부로 돈을
 * 내보내는 동작이라 상태머신을 옮기는 범용 함수 안에 섞을 것이 아니다.
 * 대신 transitionOrder 는 REFUNDED 로 가는 길을 **막는다** — 그러지 않으면
 * 아무나 이 경로를 우회해 돈 없이 환불완료를 만들 수 있다.
 */
export async function refundOrder(
  orderNo: string,
  actor: Actor,
  reason: string,
  gateway: PaymentGateway = getPaymentGateway(),
): Promise<RefundResult> {
  if (!canRefundOrder(actor)) {
    throw new RefundError('FORBIDDEN', '이 동작을 수행할 권한이 없습니다.', 403);
  }

  const order = await prisma.order.findFirst({
    where: { orderNo },
    select: {
      id: true, orderNo: true, status: true, userId: true, browserSessionId: true,
      pointsUsed: true, payable: true, usedCouponId: true, canceledAt: true, confirmedAt: true,
      items: { select: { id: true, variantId: true, quantity: true, canceledAt: true } },
      payment: { select: { id: true, status: true, pgPaymentKey: true, refundedAmount: true } },
    },
  });
  if (!order) throw new RefundError('ORDER_NOT_FOUND', '주문을 찾을 수 없습니다.', 404);

  if (order.status === 'REFUNDED') {
    throw new RefundError('ALREADY_REFUNDED', '이미 환불된 주문입니다.');
  }

  /*
   * 상태머신이 허용하지 않는 전이는 여기서 막힌다(취소·반품완료에서만 온다).
   *
   * **core 의 오류를 그대로 흘려보내지 않는다.** `transition` 은
   * `OrderTransitionError` 를 던지는데 창구는 `RefundError` 와
   * `TransitionError` 만 매핑한다 — 그대로 두면 **갈 수 없는 전이가 500** 이
   * 된다. 반품접수 상태에서 환불을 눌러 보다 실제로 그렇게 났다. 화면이 낡은
   * 단추를 들고 있었을 뿐인데 서버 잘못처럼 보인다.
   */
  try {
    transition(order.status, 'REFUNDED');
  } catch {
    throw new RefundError(
      'NOT_REFUNDABLE',
      `${ORDER_STATUS_LABEL[order.status]} 주문은 환불할 수 없습니다. 취소나 반품완료를 거쳐야 합니다.`,
      409,
    );
  }

  /**
   * 재고를 되돌릴지는 **어디서 왔는지**가 정한다.
   *
   * 취소(cancelOrder)는 그 자리에서 이미 재고를 풀었다. 반품 경로는 아무도
   * 풀지 않아 지금까지 재고가 영영 잠겨 있었다.
   *
   * REFUNDED 로 들어오는 길이 이 둘뿐이라 이 판단이 성립한다. 길이 하나
   * 더 생기면 이 가정이 깨지므로, 상태머신을 지키는 테스트를 함께 두었다.
   */
  const fromReturn = order.status === 'RETURNED';

  const captured =
    order.payment?.status === 'DONE' || order.payment?.status === 'PARTIAL_CANCELED';
  if (!captured || !order.payment?.pgPaymentKey) {
    /**
     * 돈이 나간 적 없으면 환불도 없다.
     *
     * 여기서 그냥 상태만 옮기면 "환불완료" 라고 적히는데 실제로는 아무 일도
     * 일어나지 않는다 — 이 파일이 고치려는 바로 그 상태가 된다.
     */
    throw new RefundError(
      'NOTHING_TO_REFUND',
      `${ORDER_STATUS_LABEL[order.status]} 주문에 환불할 결제가 없습니다.`,
    );
  }

  /**
   * PG 취소는 트랜잭션 밖에서 먼저 부른다.
   *
   * 외부 호출은 롤백할 수 없다. 실패하면 아무것도 바꾸지 않은 채로 끝나는
   * 것이 맞고, 성공한 뒤 DB 가 실패하면 같은 키로 다시 시도하면 된다.
   */
  /*
   * **돌려줄 것은 받은 것 − 이미 돌려준 것이다.** 예전에는 포인트 원장에 돌려준 흔적이
   * 하나라도 있으면 건너뛰었다. 부분 취소가 생기자 그 흔적은 "일부만 돌려줬다" 일 수 있게
   * 됐고, 그대로 두면 **남은 포인트를 영영 안 돌려준다.** 환불 기록의 합으로 센다(옛 주문은
   * refundedSoFar 가 원장으로 판단한다).
   */
  const soFar = await refundedSoFar(prisma, order);
  const rest = remainingRefund({
    payable: order.payable, cashRefunded: soFar.cash,
    pointsUsed: order.pointsUsed, pointsReturned: soFar.points,
  });
  // 출고 전에 일부 취소된 줄은 재고가 이미 돌아와 있다
  const live = order.items.filter((i) => !i.canceledAt);

  await gateway.cancel({
    paymentKey: order.payment.pgPaymentKey,
    amount: null, // 남은 금액 전부. 앞선 부분 취소 몫은 PG 가 이미 빼고 있다
    reason,
    // 같은 환불을 두 번 보내도 한 번만 처리되게 한다. 재시도로 두 번 돈이
    // 나가는 사고를 막는 유일한 장치다.
    idempotencyKey: `refund-${order.orderNo}`,
  });

  const now = new Date();
  const refunded = rest.cash;
  let stockRestored = 0;
  let pointsReturned = 0;
  let rewardReclaimed = 0;

  await prisma.$transaction(async (tx) => {
    // 조건부 UPDATE — 그 사이 다른 요청이 먼저 환불했으면 0건이 나온다
    const { count } = await tx.order.updateMany({
      where: { id: order.id, status: order.status },
      /*
       * `canceledAt` 은 **돈이 나간 시각**이다. 결제 취소에서만 찍고 있었는데,
       * 반품으로 들어온 환불(RETURNED → REFUNDED)은 취소를 거치지 않아 이 칸이
       * 비어 있었다. 정산도 대시보드도 이 시각으로 환불을 세므로, 비어 있으면
       * 반품 환불이 어디에서도 빠지지 않는다 — 돌려준 돈이 장부에는 남는다.
       *
       * 취소 뒤 환불(CANCELLED → REFUNDED)이면 취소 시각을 덮어쓰지 않는다.
       * 그 주문의 돈은 취소 때 이미 멈췄고, 두 번 빼면 안 된다.
       */
      data: { status: 'REFUNDED', ...(order.canceledAt === null ? { canceledAt: now } : {}) },
    });
    if (count === 0) throw new RefundError('ALREADY_PROCESSED', '이미 처리된 주문입니다.');

    await tx.orderItem.updateMany({
      where: { orderId: order.id, canceledAt: null },
      // 확정 뒤 반품이면 정산이 돌아간 달에 뺀다(close-settlement)
      data: { status: 'REFUNDED', canceledAt: now, refundedAfterConfirm: order.confirmedAt !== null },
    });

    if (fromReturn) {
      for (const item of live) {
        await tx.productVariant.updateMany({
          where: { id: item.variantId },
          data: { stock: { increment: item.quantity } },
        });
        stockRestored += item.quantity;
      }
    }

    /**
     * 쓴 포인트를 돌려준다. 원장에 이미 있으면 건너뛴다.
     *
     * 취소 경로가 먼저 돌려줬을 수 있다. 상태로 판단하지 않고 원장을 보는
     * 이유는, 잔액만 두 번 올라가면 아무도 알아채지 못하기 때문이다 —
     * 적립 지급이 같은 이유로 같은 방식을 쓴다.
     */
    if (rest.points > 0) {
      await tx.user.update({
        where: { id: order.userId },
        data: { pointBalance: { increment: rest.points } },
      });
      await tx.pointTransaction.create({
        data: {
          userId: order.userId,
          amount: rest.points,
          reason: 'CANCEL_REFUND',
          orderId: order.id,
          note: `주문 ${order.orderNo} 환불`,
        },
      });
      pointsReturned = rest.points;
    }

    /*
     * 구매확정으로 준 적립은 되가져온다. 물건도 돌아오고 돈도 돌아가는데
     * 적립만 남으면, 확정 → 적립 → 하자 반품을 되풀이하는 만큼 쌓인다.
     * 확정에 이른 적 없는 주문이면 줄 적립도 없어서 아무 일도 하지 않는다.
     */
    rewardReclaimed = (await reclaimPurchaseReward(tx, order)).reclaimed;

    // 쿠폰 되살리기. 이미 풀려 있어도 같은 결과라 그대로 둔다.
    if (order.usedCouponId) {
      await tx.userCoupon.update({ where: { id: order.usedCouponId }, data: { usedAt: null } });
    }

    await tx.payment.update({
      where: { id: order.payment!.id },
      data: {
        status: 'CANCELED',
        refundedAmount: order.payment!.refundedAmount + refunded,
        canceledAt: now,
      },
    });

    await tx.orderRefund.create({
      data: {
        orderId: order.id,
        amount: refunded,
        points: rest.points,
        shippingDeducted: 0,
        itemIds: live.map((i) => i.id),
        kind: 'REFUND',
        reason,
        actorId: actor.id,
        idempotencyKey: `refund-${order.orderNo}`,
      },
    });

    await tx.orderStatusLog.create({
      data: {
        orderId: order.id, from: order.status, to: 'REFUNDED',
        actor: actor.id, note: reason,
      },
    });
  });

  /**
   * 매출 이벤트는 트랜잭션 밖에서.
   *
   * 분석 기록이 실패했다고 환불을 되돌릴 수는 없다 — 돈은 이미 나갔다.
   */
  await recordServerEvent({
    name: 'refund',
    occurredAt: new Date(),
    sessionId: order.browserSessionId ?? `order-${order.orderNo}`,
    anonymousId: order.browserSessionId ?? `order-${order.orderNo}`,
    userId: order.userId,
    path: '/admin',
    productId: null, variantId: null,
    orderId: order.orderNo,
    merchantId: null,
    value: refunded,
    quantity: live.reduce((sum, i) => sum + i.quantity, 0),
    props: { reason, fromReturn },
  });

  return {
    orderNo: order.orderNo,
    orderStatus: 'REFUNDED',
    refunded,
    stockRestored,
    pointsReturned,
    rewardReclaimed,
  };
}
