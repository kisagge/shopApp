import 'server-only';
import { prisma } from '@shop/db';
import {
  isCancellableByCustomer, transition, canRefundOrder, remainingRefund, ORDER_STATUS_LABEL,
  mustCloseVirtualAccount,
  type Actor, type OrderStatus, type PaymentGateway,
} from '@shop/core';
import { getPaymentGateway } from '~/lib/payments';
import { recordServerEvent } from '~/lib/analytics/server';
import { refundedSoFar } from './refund-ledger';

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
  readonly pointsReturned: number;
}

/** 결제 취소가 오래 걸려도 잠금을 무한히 쥐지 않는다 */
const LOCK_TIMEOUT_MS = 20_000;

function loadOrder(db: Pick<typeof prisma, 'order'>, orderNo: string, actor: Actor, staff: boolean) {
  return db.order.findFirst({
    where: { orderNo, ...(staff ? {} : { userId: actor.id }) },
    select: {
      id: true, orderNo: true, status: true, userId: true, browserSessionId: true,
      pointsUsed: true, payable: true, usedCouponId: true,
      items: { select: { id: true, variantId: true, quantity: true, canceledAt: true } },
      payment: { select: { id: true, status: true, pgPaymentKey: true, refundedAmount: true } },
    },
  });
}

function assertCancellable(status: OrderStatus, isStaff: boolean): void {
  // 이미 끝난 주문과 아직 진행 중인데 취소할 수 없는 주문은 다른 이야기다.
  // 둘을 한 메시지로 뭉뚱그리면 "출고된 주문은 취소할 수 없습니다" 가
  // 이미 환불된 주문에도 뜬다.
  if (status === 'CANCELLED' || status === 'REFUNDED') {
    throw new CancelError('ALREADY_CANCELLED', `이미 ${ORDER_STATUS_LABEL[status]}된 주문입니다.`);
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

  const first = await loadOrder(prisma, orderNo, actor, isStaff);
  if (!first) throw new CancelError('ORDER_NOT_FOUND', '주문을 찾을 수 없습니다.', 404);
  // 잠그기 전에 한 번 본다 — 취소할 수 없는 주문으로 잠금을 쥐지 않는다
  assertCancellable(first.status, isStaff);

  let refunded = 0;
  let pointsReturned = 0;
  let quantity = 0;
  let nextStatus: OrderStatus = 'CANCELLED';
  let pgDone = false;

  try {
    await prisma.$transaction(async (tx) => {
      /*
       * **이 주문에 대한 다른 취소는 여기서 기다린다.** 예전에는 남은 줄과 돌려준 몫을 잠그기 전에
       * 읽고 "상태가 그대로면" 만 보았다. 일부 취소는 주문 상태를 바꾸지 않으므로, 그사이 한 줄이
       * 취소되면 그 줄의 재고와 포인트가 한 번 더 돌아갔다. 일부 취소·일부 반품과 같은 잠금을 잡고,
       * 그 안에서 다시 읽어 계산한다. 대가는 결제 취소를 기다리는 동안 연결 하나를 쥐는 것이다.
       */
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${first.id} FOR UPDATE`;

      const order = await loadOrder(tx, orderNo, actor, isStaff);
      if (!order) throw new CancelError('ORDER_NOT_FOUND', '주문을 찾을 수 없습니다.', 404);
      assertCancellable(order.status, isStaff);

      // 상태머신이 허용하지 않는 전이는 여기서 막힌다
      nextStatus = transition(order.status, 'CANCELLED');

      /*
       * **돌려줄 것은 받은 것 − 이미 돌려준 것이다.** 한 줄을 먼저 취소한 주문을 전부 취소할 때
       * 주문에 적힌 결제액을 통째로 돌려주면 그 줄 몫이 두 번 나간다. 이미 취소된 줄의 재고도
       * 이미 돌아와 있다 — 남은 줄만 푼다.
       */
      const soFar = await refundedSoFar(tx, order);
      const rest = remainingRefund({
        payable: order.payable, cashRefunded: soFar.cash,
        pointsUsed: order.pointsUsed, pointsReturned: soFar.points,
      });
      const live = order.items.filter((i) => !i.canceledAt);

      // ── PG 취소. 실제로 돈이 나간 경우에만 부른다.
      const captured = order.payment?.status === 'DONE' || order.payment?.status === 'PARTIAL_CANCELED';
      if (captured && order.payment?.pgPaymentKey) {
        // 여기서야 필요하다. 여기까지 오지 않으면 만들지 않는다.
        await (gateway ?? getPaymentGateway()).cancel({
          paymentKey: order.payment.pgPaymentKey,
          amount: null, // 남은 금액 전부 — PG 는 이미 부분 취소된 몫을 빼고 돌려준다
          reason,
          // 같은 취소를 두 번 보내도 한 번만 처리되게 한다. 재시도로 두 번
          // 환불되는 사고를 막는 유일한 장치다.
          idempotencyKey: `cancel-${order.orderNo}`,
        });
        pgDone = true;
        refunded = rest.cash;
      }

      /*
       * **입금 전 가상계좌는 닫는다.** 닫지 않으면 계좌가 살아 있어, 취소한 주문에 손님이 그대로 입금할 수
       * 있었다 — 그 돈은 입금 처리에서 멈춰 아무 데도 적히지 않았다. 입금 전이라 돌려줄 돈이 없고 환불 계좌도
       * 필요 없다(PG 문서). 닫기가 실패하면 **주문을 취소하지 않는다** — 그사이 입금됐을 수 있고, 그러면
       * 입금 처리가 주문을 결제완료로 옮기는 것이 맞다.
       */
      const closingAccount = !captured && mustCloseVirtualAccount(order.payment?.status ?? null) && !!order.payment?.pgPaymentKey;
      if (closingAccount) {
        await (gateway ?? getPaymentGateway()).cancel({
          paymentKey: order.payment!.pgPaymentKey!,
          amount: null,
          reason,
          idempotencyKey: `cancel-${order.orderNo}`,
        });
      }

      // 조건부 UPDATE — 잠금 밖에서 상태를 옮기는 길(입금 처리 등)이 먼저 옮겼으면 0건이 나온다
      const { count } = await tx.order.updateMany({
        where: { id: order.id, status: order.status },
        data: { status: nextStatus, canceledAt: new Date() },
      });
      if (count === 0) throw new CancelError('ALREADY_PROCESSED', '이미 처리된 주문입니다.');

      const now = new Date();
      await tx.orderItem.updateMany({
        where: { orderId: order.id, canceledAt: null },
        data: { status: nextStatus, canceledAt: now },
      });

      // ── 재고 복원. 잠긴 재고를 풀지 않으면 팔 수 있는 물건이 영영 묶인다.
      for (const item of live) {
        await tx.productVariant.updateMany({
          where: { id: item.variantId },
          data: { stock: { increment: item.quantity } },
        });
        quantity += item.quantity;
      }

      // ── 포인트 복원. 잔액만 올리지 않고 원장에도 남긴다.
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
            note: `주문 ${order.orderNo} 취소`,
          },
        });
      }
      pointsReturned = rest.points;

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
            // 닫은 가상계좌는 PG 에서도 취소다 — 결제창에서 그만둔 것(ABORTED)과 다르다
            status: captured || closingAccount ? 'CANCELED' : 'ABORTED',
            refundedAmount: order.payment.refundedAmount + refunded,
            canceledAt: now,
          },
        });
      }

      // 돈이나 포인트가 돌아갔으면 한 줄 남긴다. 매출은 이 표의 합으로 환불을 뺀다
      if (refunded > 0 || rest.points > 0) {
        await tx.orderRefund.create({
          data: {
            orderId: order.id,
            amount: refunded,
            points: rest.points,
            // 앞선 부분 취소에서 뗀 배송비는 돌려준다 — 보낸 물건이 없다
            shippingDeducted: -soFar.shippingDeducted,
            itemIds: live.map((i) => i.id),
            kind: 'CANCEL',
            reason,
            actorId: actor.id,
            idempotencyKey: `cancel-${order.orderNo}`,
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
    }, { timeout: LOCK_TIMEOUT_MS, maxWait: LOCK_TIMEOUT_MS });
  } catch (error) {
    if (pgDone) {
      // 돈은 나갔는데 장부가 없다. 다시 누르면 같은 멱등 키가 나가 돈은 두 번 나가지 않고 장부만 채워진다
      console.error('[cancel-order] 결제 취소 후 장부 반영 실패 — 다시 시도하거나 수동 대사 필요', { orderNo }, error);
    }
    throw error;
  }

  if (refunded > 0) {
    await recordServerEvent({
      name: 'refund',
      occurredAt: new Date(),
      sessionId: first.browserSessionId ?? `order-${first.orderNo}`,
      anonymousId: first.browserSessionId ?? `order-${first.orderNo}`,
      userId: first.userId,
      path: '/order',
      productId: null, variantId: null,
      orderId: first.orderNo,
      merchantId: null,
      value: refunded,
      quantity,
      props: { reason, byStaff: isStaff },
    });
  }

  return {
    orderNo: first.orderNo,
    status: refunded > 0 ? 'REFUNDED' : nextStatus,
    refunded,
    pointsReturned,
  };
}
