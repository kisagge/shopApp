import 'server-only';
import { createHash } from 'node:crypto';
import { prisma } from '@shop/db';
import {
  canRefundOrder, isPaidStatus, planPartialCancel, shippingBorneBy, statusBeforeReturn, transition,
  PartialCancelError, RETURN_REASON,
  type Actor, type PaymentGateway, type ReturnReason, type Won,
} from '@shop/core';
import { getPaymentGateway } from '~/lib/payments';
import { recordServerEvent } from '~/lib/analytics/server';
import { refundOrder } from '~/lib/admin/refund-order';
import { policyOf } from './cancel-items';
import { reclaimPurchaseReward } from './reclaim-reward';
import { refundedSoFar } from './refund-ledger';
import { ReturnError } from './return-request';

/**
 * 반품 회수를 확인하고 돌려준다.
 *
 * 승인은 "돌려보내도 된다" 이고 이것은 "돌아왔다" 다. 물건이 오기 전에 돈을 돌려주면 안 오는
 * 물건의 값을 치른다 — 그래서 승인한 신청에만 된다.
 *
 * **줄을 고른 신청이면 그 줄만.** 돈 계산은 일부 취소와 같은 규칙(core 의 planPartialCancel)
 * 이다: 그 줄에 붙은 쿠폰 몫은 빼고, 포인트 몫은 포인트로. 다른 점 셋.
 *
 * - **배송비는 단순 변심일 때만 뗀다.** 남은 상품이 무료배송 기준 아래로 떨어져도 판매자
 *   잘못(불량·오배송·파손)으로 돌려보낸 것이면 손님이 물 이유가 없다.
 * - **재고를 돌린다.** 물건이 돌아왔다.
 * - **구매확정 적립을 그 줄 몫만큼 되가져온다.** 확정 전이면 줄 적립만 줄여 둔다.
 *
 * 남는 줄이 없으면(전부 반품) 주문째 반품완료로 옮기고 기존 환불(refundOrder)을 탄다 — 쿠폰
 * 되살리기·적립 전부 회수·앞서 돌려준 몫 빼기가 거기 있다.
 *
 * 한 주문의 반품 처리는 **주문 행을 잠그고** 한다. 일부 취소와 같은 이유다.
 */

export type CompleteReturnPreview =
  | { readonly kind: 'partial'; readonly cash: Won; readonly points: Won; readonly shippingDeducted: Won }
  | { readonly kind: 'full' };

export interface CompleteReturnResult {
  readonly orderNo: string;
  readonly kind: 'partial' | 'full';
  readonly refunded: number;
  readonly pointsReturned: number;
  readonly shippingDeducted: number;
  readonly orderStatus: string;
}

const LOCK_TIMEOUT_MS = 20_000;

function loadOrder(db: Pick<typeof prisma, 'order'>, orderNo: string) {
  return db.order.findFirst({
    where: { orderNo },
    select: {
      id: true, orderNo: true, status: true, userId: true, browserSessionId: true,
      couponDiscount: true, pointsUsed: true, rewardPoints: true, shippingFee: true,
      isRemoteArea: true, payable: true, shippingPolicy: true, confirmedAt: true, deliveredAt: true,
      items: {
        orderBy: { id: 'asc' },
        select: {
          id: true, variantId: true, quantity: true, subtotal: true, status: true,
          couponShare: true, pointsShare: true, rewardShare: true, canceledAt: true,
        },
      },
      payment: { select: { id: true, status: true, pgPaymentKey: true, refundedAmount: true } },
      returnRequests: {
        orderBy: { requestedAt: 'desc' },
        take: 1,
        select: { id: true, status: true, reason: true, itemIds: true, receivedAt: true, receivedBy: true },
      },
    },
  });
}

type Loaded = NonNullable<Awaited<ReturnType<typeof loadOrder>>>;

/** 신청의 줄. 옛 신청(줄 없음)은 반품접수인 줄 전부 */
function requestedLines(order: Loaded, itemIds: readonly string[]) {
  return order.items.filter((i) =>
    !i.canceledAt && (itemIds.length > 0 ? itemIds.includes(i.id) : i.status === 'RETURN_REQUESTED'));
}

function approvedRequest(order: Loaded) {
  const request = order.returnRequests[0];
  if (!request) throw new ReturnError('NO_REQUEST', '반품 신청이 없습니다.', 404);
  if (request.status !== 'APPROVED') {
    throw new ReturnError(
      'NOT_APPROVED',
      request.status === 'COMPLETED' ? '이미 환불까지 끝난 신청입니다.' : '승인한 신청만 회수 확인할 수 있습니다.',
    );
  }
  return request;
}

const reasonOf = (value: string): ReturnReason =>
  (RETURN_REASON as readonly string[]).includes(value) ? (value as ReturnReason) : 'CHANGED_MIND';

function planOf(order: Loaded, lineIds: readonly string[], reason: ReturnReason, policy: Awaited<ReturnType<typeof policyOf>>, deductedSoFar: number) {
  try {
    return planPartialCancel({
      lines: order.items.map((i) => ({
        id: i.id, subtotal: i.subtotal,
        couponShare: i.couponShare, pointsShare: i.pointsShare, rewardShare: i.rewardShare,
        canceled: Boolean(i.canceledAt),
      })),
      cancelIds: lineIds,
      order,
      policy,
      shippingDeductedSoFar: deductedSoFar,
      chargeShipping: shippingBorneBy(reason) === 'CUSTOMER',
    });
  } catch (error) {
    if (error instanceof PartialCancelError) throw new ReturnError(error.code, error.message);
    throw error;
  }
}

/** 운영 화면이 단추 옆에 보여 줄 금액. 아무것도 바꾸지 않는다 */
export async function previewCompleteReturn(orderNo: string, actor: Actor): Promise<CompleteReturnPreview> {
  if (!canRefundOrder(actor)) throw new ReturnError('FORBIDDEN', '이 동작을 수행할 권한이 없습니다.', 403);
  const order = await loadOrder(prisma, orderNo);
  if (!order) throw new ReturnError('ORDER_NOT_FOUND', '주문을 찾을 수 없습니다.', 404);
  const request = approvedRequest(order);

  const lines = requestedLines(order, request.itemIds);
  const live = order.items.filter((i) => !i.canceledAt);
  if (lines.length === live.length) return { kind: 'full' };

  const soFar = await refundedSoFar(prisma, order);
  const plan = planOf(order, lines.map((l) => l.id), reasonOf(request.reason), await policyOf(order.shippingPolicy), soFar.shippingDeducted);
  return { kind: 'partial', cash: plan.cash, points: plan.points, shippingDeducted: plan.shippingDeducted };
}

export async function completeReturn(
  orderNo: string,
  actor: Actor,
  gateway?: PaymentGateway,
): Promise<CompleteReturnResult> {
  if (!canRefundOrder(actor)) throw new ReturnError('FORBIDDEN', '이 동작을 수행할 권한이 없습니다.', 403);

  const first = await loadOrder(prisma, orderNo);
  if (!first) throw new ReturnError('ORDER_NOT_FOUND', '주문을 찾을 수 없습니다.', 404);
  const firstRequest = approvedRequest(first);
  const firstLines = requestedLines(first, firstRequest.itemIds);
  if (firstLines.length === 0) throw new ReturnError('NO_ITEMS', '돌려받을 상품이 없습니다.');

  // ── 전부 반품: 주문째 반품완료로 옮기고 기존 환불을 탄다
  if (firstLines.length === first.items.filter((i) => !i.canceledAt).length) {
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.order.updateMany({
        where: { id: first.id, status: 'RETURN_REQUESTED' },
        data: { status: transition('RETURN_REQUESTED', 'RETURNED') },
      });
      if (count === 0) throw new ReturnError('ALREADY_PROCESSED', '이미 처리된 주문입니다.');
      await tx.orderItem.updateMany({
        where: { orderId: first.id, canceledAt: null, id: { in: firstLines.map((l) => l.id) } },
        data: { status: 'RETURNED' },
      });
      await tx.orderStatusLog.create({
        data: { orderId: first.id, from: 'RETURN_REQUESTED', to: 'RETURNED', actor: actor.id, note: '반품 회수 확인' },
      });
    });

    const refund = await refundOrder(orderNo, actor, '반품 회수 확인', gateway);
    await prisma.returnRequest.update({
      where: { id: firstRequest.id },
      data: {
        status: 'COMPLETED', resolvedAt: new Date(), resolvedBy: actor.id,
        // 가맹점이 먼저 확인했으면 그 기록을 남기고, 아니면 운영진이 눌렀을 때가 확인한 때다
        ...(firstRequest.receivedAt ? {} : { receivedAt: new Date(), receivedBy: actor.id }),
      },
    });
    return {
      orderNo, kind: 'full', refunded: refund.refunded, pointsReturned: refund.pointsReturned,
      shippingDeducted: 0, orderStatus: refund.orderStatus,
    };
  }

  // ── 일부 반품
  const policy = await policyOf(first.shippingPolicy);
  const lineKey = firstLines.map((l) => l.id).sort().join(',');
  const idempotencyKey = `return-${orderNo}-${createHash('sha256').update(lineKey).digest('hex').slice(0, 32)}`;

  let result: CompleteReturnResult | null = null;
  let quantity = 0;
  let pgDone = false;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${first.id} FOR UPDATE`;

      const order = await loadOrder(tx, orderNo);
      if (!order) throw new ReturnError('ORDER_NOT_FOUND', '주문을 찾을 수 없습니다.', 404);
      const request = approvedRequest(order);
      const lines = requestedLines(order, request.itemIds);
      if (lines.length === 0) throw new ReturnError('ALREADY_PROCESSED', '이미 처리된 신청입니다.');

      const reason = reasonOf(request.reason);
      const soFar = await refundedSoFar(tx, order);
      const plan = planOf(order, lines.map((l) => l.id), reason, policy, soFar.shippingDeducted);

      const payment = order.payment;
      const captured = payment && isPaidStatus(payment.status) && payment.pgPaymentKey;
      if (plan.cash > 0) {
        if (!captured) throw new ReturnError('NOTHING_TO_REFUND', '돌려줄 결제가 없습니다.');
        await (gateway ?? getPaymentGateway()).cancel({
          paymentKey: payment.pgPaymentKey!,
          amount: plan.cash,
          reason: '반품 회수 확인',
          idempotencyKey,
        });
        pgDone = true;
      }

      const now = new Date();
      const { count } = await tx.orderItem.updateMany({
        where: { id: { in: [...plan.itemIds] }, canceledAt: null, status: 'RETURN_REQUESTED' },
        data: { status: 'REFUNDED', canceledAt: now, refundedAfterConfirm: order.confirmedAt !== null },
      });
      if (count !== plan.itemIds.length) throw new ReturnError('ALREADY_PROCESSED', '이미 처리된 상품입니다.');

      // 물건이 돌아왔다
      for (const line of lines) {
        await tx.productVariant.updateMany({
          where: { id: line.variantId },
          data: { stock: { increment: line.quantity } },
        });
        quantity += line.quantity;
      }

      if (plan.points > 0) {
        await tx.user.update({ where: { id: order.userId }, data: { pointBalance: { increment: plan.points } } });
        await tx.pointTransaction.create({
          data: {
            userId: order.userId, amount: plan.points, reason: 'CANCEL_REFUND', orderId: order.id,
            note: `주문 ${order.orderNo} 일부 반품`,
          },
        });
      }

      /*
       * 확정 뒤 반품이면 이미 준 적립에서 그 줄 몫을 되가져오고, 확정 전이면 앞으로 줄 적립을
       * 줄여 둔다. 둘 다 하면 두 번 깎고, 둘 다 안 하면 반품한 줄의 적립이 남는다.
       */
      if (order.confirmedAt) {
        await reclaimPurchaseReward(tx, order, plan.rewardReduced);
      } else {
        await tx.order.update({ where: { id: order.id }, data: { rewardPoints: { decrement: plan.rewardReduced } } });
      }

      if (payment && plan.cash > 0) {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: 'PARTIAL_CANCELED', refundedAmount: payment.refundedAmount + plan.cash },
        });
      }

      await tx.orderRefund.create({
        data: {
          orderId: order.id, amount: plan.cash, points: plan.points,
          shippingDeducted: plan.shippingDeducted, itemIds: [...plan.itemIds],
          kind: 'RETURN', reason: '반품 회수 확인', actorId: actor.id, idempotencyKey,
        },
      });

      await tx.returnRequest.update({
        where: { id: request.id },
        data: {
          status: 'COMPLETED', resolvedAt: now, resolvedBy: actor.id,
          ...(request.receivedAt ? {} : { receivedAt: now, receivedBy: actor.id }),
        },
      });

      // 남은 줄은 받은 그대로다 — 주문은 그 자리로 돌아간다
      const back = transition(order.status, statusBeforeReturn(order));
      const { count: moved } = await tx.order.updateMany({
        where: { id: order.id, status: order.status },
        data: { status: back },
      });
      if (moved === 0) throw new ReturnError('ALREADY_PROCESSED', '이미 처리된 주문입니다.');
      await tx.orderStatusLog.create({
        data: {
          orderId: order.id, from: order.status, to: back, actor: actor.id,
          note: `일부 반품 환불 ${lines.length}건`,
        },
      });

      result = {
        orderNo, kind: 'partial', refunded: plan.cash, pointsReturned: plan.points,
        shippingDeducted: plan.shippingDeducted, orderStatus: back,
      };
    }, { timeout: LOCK_TIMEOUT_MS, maxWait: LOCK_TIMEOUT_MS });
  } catch (error) {
    if (pgDone) {
      console.error('[complete-return] 결제 취소 후 장부 반영 실패 — 다시 시도하거나 수동 대사 필요', {
        orderNo, idempotencyKey,
      }, error);
    }
    throw error;
  }

  const done = result as CompleteReturnResult | null;
  if (!done) throw new ReturnError('ALREADY_PROCESSED', '이미 처리된 신청입니다.');

  if (done.refunded > 0) {
    await recordServerEvent({
      name: 'refund',
      occurredAt: new Date(),
      sessionId: first.browserSessionId ?? `order-${orderNo}`,
      anonymousId: first.browserSessionId ?? `order-${orderNo}`,
      userId: first.userId,
      path: '/admin',
      productId: null, variantId: null,
      orderId: orderNo,
      merchantId: null,
      value: done.refunded,
      quantity,
      props: { partial: true, fromReturn: true },
    });
  }

  return done;
}
