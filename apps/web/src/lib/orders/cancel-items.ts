import 'server-only';
import { createHash } from 'node:crypto';
import { prisma } from '@shop/db';
import {
  canRefundOrder, isPaidStatus, planPartialCancel, remainingRefund, shippingPolicyFrom, PartialCancelError,
  ORDER_STATUS_LABEL, won,
  type Actor, type OrderStatus, type PaymentGateway, type ShippingPolicy, type Won,
} from '@shop/core';
import { getPaymentGateway } from '~/lib/payments';
import { getShippingPolicy } from '~/lib/shipping-policy';
import { recordServerEvent } from '~/lib/analytics/server';
import { cancelOrder } from './cancel-order';
import { refundedSoFar } from './refund-ledger';

/**
 * 주문의 **일부 상품만** 취소하고 그만큼 돌려준다.
 *
 * 돈 계산은 core 의 `planPartialCancel` 이 한다(쿠폰·포인트 몫, 무료배송 기준 아래로
 * 떨어질 때의 배송비). 여기는 그 계산을 **한 번에 한 요청만** 하게 하고, 결제 취소와
 * 장부를 맞춘다.
 *
 * **왜 주문을 잠그고 결제 취소까지 그 안에서 하나.** 전액 취소는 "상태가 그대로면
 * 바꾼다" 는 조건부 UPDATE 하나로 경쟁을 막는다. 부분 취소는 그걸로 부족하다 — 두 사람이
 * 서로 다른 줄을 동시에 취소하면 둘 다 "아직 배송비를 안 뗐다" 를 보고 계산해서, 배송비를
 * 두 번 떼거나 한 번도 안 뗀다. 줄 조건은 둘 다 통과한다. 그래서 주문 행을 잠그고 그 안에서
 * 남은 줄·이미 돌려준 것을 다시 읽어 계산한다.
 *
 * 대가는 결제 취소를 기다리는 동안 DB 연결 하나를 쥐는 것이다. 한 주문에 대한 취소는
 * 사람이 누르는 속도로만 오고, 다른 주문은 막히지 않는다. 결제 취소가 성공했는데 장부에
 * 못 적고 끝나면(연결이 끊기는 등) 되돌릴 수 없으므로 크게 남긴다 — 같은 줄을 다시 누르면
 * 같은 멱등 키가 나가서 돈은 두 번 나가지 않고 장부만 채워진다.
 */

export class CancelItemsError extends Error {
  constructor(readonly code: string, message: string, readonly status = 409) {
    super(message);
    this.name = 'CancelItemsError';
  }
}

export type CancelItemsPreview =
  | {
      readonly kind: 'partial';
      readonly cash: Won;
      readonly points: Won;
      readonly shippingDeducted: Won;
    }
  /** 남는 줄이 없다 — 주문 전체 취소가 된다. 앞서 뗀 배송비까지 돌아온다 */
  | { readonly kind: 'full'; readonly cash: Won; readonly points: Won; readonly shippingDeducted: Won };

export interface CancelItemsResult {
  readonly orderNo: string;
  readonly kind: 'partial' | 'full';
  readonly refunded: number;
  readonly pointsReturned: number;
  readonly shippingDeducted: number;
}

/** 출고 전 상태. 이 줄들만 부분 취소할 수 있다 — 나간 물건은 반품이다 */
const BEFORE_SHIPPING: readonly OrderStatus[] = ['PAID', 'PREPARING'];

/** 손님이 스스로 일부를 취소할 수 있는 주문 상태 — 전액 취소와 같은 선(결제완료까지) */
const CUSTOMER_PARTIAL: readonly OrderStatus[] = ['PAID'];

/** 결제 취소가 오래 걸려도 잠금을 무한히 쥐지 않는다 */
const LOCK_TIMEOUT_MS = 20_000;

interface Loaded {
  readonly order: NonNullable<Awaited<ReturnType<typeof loadOrder>>>;
  readonly policy: ShippingPolicy;
}

function loadOrder(db: Pick<typeof prisma, 'order'>, orderNo: string, actor: Actor, staff: boolean) {
  return db.order.findFirst({
    where: { orderNo, ...(staff ? {} : { userId: actor.id }) },
    select: {
      id: true, orderNo: true, status: true, userId: true, browserSessionId: true,
      couponDiscount: true, pointsUsed: true, rewardPoints: true, shippingFee: true,
      isRemoteArea: true, payable: true, shippingPolicy: true,
      items: {
        orderBy: { id: 'asc' },
        select: {
          id: true, variantId: true, merchantId: true, quantity: true, subtotal: true, status: true,
          couponShare: true, pointsShare: true, rewardShare: true, canceledAt: true,
        },
      },
      payment: { select: { id: true, status: true, method: true, pgPaymentKey: true, refundedAmount: true } },
    },
  });
}

/** 주문에 박힌 정책. 옛 주문은 지금 정책을 쓴다 — 그때 기준을 남기지 않았다 */
export async function policyOf(json: unknown): Promise<ShippingPolicy> {
  if (json && typeof json === 'object') {
    const row = json as { baseFee?: unknown; freeThreshold?: unknown; remoteSurcharge?: unknown };
    if (typeof row.baseFee === 'number' && typeof row.remoteSurcharge === 'number' &&
        (row.freeThreshold === null || typeof row.freeThreshold === 'number')) {
      return shippingPolicyFrom({
        baseFee: row.baseFee, freeThreshold: row.freeThreshold, remoteSurcharge: row.remoteSurcharge,
      });
    }
  }
  return getShippingPolicy();
}

function assertCancellable(loaded: Loaded, itemIds: readonly string[], staff: boolean): void {
  const { order } = loaded;
  const allowed = staff ? BEFORE_SHIPPING : CUSTOMER_PARTIAL;
  if (!allowed.includes(order.status)) {
    throw new CancelItemsError(
      'NOT_CANCELLABLE',
      staff
        ? `${ORDER_STATUS_LABEL[order.status]} 주문은 일부만 취소할 수 없습니다. 출고된 상품은 반품으로 진행해 주세요.`
        : '결제완료 상태에서만 일부 상품을 직접 취소할 수 있습니다. 배송 준비가 시작된 뒤에는 고객센터로 문의해 주세요.',
    );
  }

  const payment = order.payment;
  if (!payment || !isPaidStatus(payment.status) || !payment.pgPaymentKey) {
    throw new CancelItemsError('NOT_PAID', '결제가 끝난 주문만 일부 취소할 수 있습니다.');
  }
  /*
   * 가상계좌는 돌려받을 계좌를 따로 받아야 부분 환불이 된다. 그 입력을 만들기 전까지는
   * 일부만 취소하지 못하게 막는다 — 막지 않으면 PG 가 거절하고 손님은 이유를 모른다.
   */
  if (payment.method === 'VIRTUAL_ACCOUNT') {
    throw new CancelItemsError('VIRTUAL_ACCOUNT', '가상계좌 결제는 일부만 취소할 수 없습니다. 주문 전체를 취소해 주세요.');
  }

  const byId = new Map(order.items.map((i) => [i.id, i]));
  for (const id of itemIds) {
    const item = byId.get(id);
    if (item && item.canceledAt === null && !BEFORE_SHIPPING.includes(item.status)) {
      throw new CancelItemsError('ITEM_SHIPPED', '이미 출고된 상품은 취소할 수 없습니다. 반품으로 진행해 주세요.');
    }
  }
}

function planOf(loaded: Loaded, itemIds: readonly string[], shippingDeductedSoFar: number) {
  const { order, policy } = loaded;
  return planPartialCancel({
    lines: order.items.map((i) => ({
      id: i.id,
      subtotal: i.subtotal,
      couponShare: i.couponShare,
      pointsShare: i.pointsShare,
      rewardShare: i.rewardShare,
      canceled: i.canceledAt !== null,
    })),
    cancelIds: itemIds,
    order,
    policy,
    shippingDeductedSoFar,
  });
}

function rethrowPlanError(error: unknown): never {
  if (error instanceof PartialCancelError) {
    const status = error.code === 'UNKNOWN_ITEM' ? 404 : error.code === 'NO_ITEMS' ? 400 : 409;
    throw new CancelItemsError(error.code, error.message, status);
  }
  throw error;
}

/** 돌려받을 금액을 미리 본다. 아무것도 바꾸지 않는다 */
export async function previewCancelItems(
  orderNo: string,
  itemIds: readonly string[],
  actor: Actor,
): Promise<CancelItemsPreview> {
  const staff = canRefundOrder(actor);
  const order = await loadOrder(prisma, orderNo, actor, staff);
  if (!order) throw new CancelItemsError('ORDER_NOT_FOUND', '주문을 찾을 수 없습니다.', 404);
  const loaded: Loaded = { order, policy: await policyOf(order.shippingPolicy) };
  assertCancellable(loaded, itemIds, staff);

  const soFar = await refundedSoFar(prisma, order);
  try {
    const plan = planOf(loaded, itemIds, soFar.shippingDeducted);
    return { kind: 'partial', cash: plan.cash, points: plan.points, shippingDeducted: plan.shippingDeducted };
  } catch (error) {
    if (error instanceof PartialCancelError && error.code === 'ALL_ITEMS') {
      const rest = remainingRefund({
        payable: order.payable, cashRefunded: soFar.cash,
        pointsUsed: order.pointsUsed, pointsReturned: soFar.points,
      });
      // 앞서 뗀 배송비가 돌아온다 — 음수로 보여 주면 헷갈리니 "돌아오는 배송비" 로 둔다
      return { kind: 'full', cash: rest.cash, points: rest.points, shippingDeducted: won(0) };
    }
    return rethrowPlanError(error);
  }
}

export async function cancelOrderItems(
  orderNo: string,
  itemIds: readonly string[],
  actor: Actor,
  reason: string,
  gateway?: PaymentGateway,
): Promise<CancelItemsResult> {
  const staff = canRefundOrder(actor);
  const first = await loadOrder(prisma, orderNo, actor, staff);
  if (!first) throw new CancelItemsError('ORDER_NOT_FOUND', '주문을 찾을 수 없습니다.', 404);

  const wanted = [...new Set(itemIds)].sort();
  const live = first.items.filter((i) => i.canceledAt === null);
  // 남는 줄이 없으면 전액 취소 경로로 — 쿠폰을 되살리고 뗀 배송비를 돌려주는 규칙이 거기 있다
  if (live.length > 0 && live.every((i) => wanted.includes(i.id)) && wanted.every((id) => live.some((i) => i.id === id))) {
    const done = await cancelOrder(orderNo, actor, reason, gateway);
    return {
      orderNo: done.orderNo, kind: 'full', refunded: done.refunded,
      pointsReturned: done.pointsReturned, shippingDeducted: 0,
    };
  }

  const policy = await policyOf(first.shippingPolicy);
  const idempotencyKey = `partial-${orderNo}-${createHash('sha256').update(wanted.join(',')).digest('hex').slice(0, 32)}`;

  let refunded = 0;
  let pointsReturned = 0;
  let shippingDeducted = 0;
  let quantity = 0;
  let pgDone = false;

  try {
    await prisma.$transaction(async (tx) => {
      // 이 주문에 대한 다른 취소는 여기서 기다린다
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${first.id} FOR UPDATE`;

      const order = await loadOrder(tx, orderNo, actor, staff);
      if (!order) throw new CancelItemsError('ORDER_NOT_FOUND', '주문을 찾을 수 없습니다.', 404);
      const loaded: Loaded = { order, policy };
      assertCancellable(loaded, wanted, staff);

      const soFar = await refundedSoFar(tx, order);
      let plan;
      try {
        plan = planOf(loaded, wanted, soFar.shippingDeducted);
      } catch (error) {
        rethrowPlanError(error);
      }

      if (plan.cash > 0) {
        await (gateway ?? getPaymentGateway()).cancel({
          paymentKey: order.payment!.pgPaymentKey!,
          amount: plan.cash,
          reason,
          idempotencyKey,
        });
        pgDone = true;
      }

      const now = new Date();
      const lines = order.items.filter((i) => plan.itemIds.includes(i.id));

      const { count } = await tx.orderItem.updateMany({
        where: { id: { in: [...plan.itemIds] }, canceledAt: null },
        data: { status: 'CANCELLED', canceledAt: now },
      });
      if (count !== plan.itemIds.length) {
        throw new CancelItemsError('ALREADY_PROCESSED', '이미 처리된 상품입니다.');
      }

      // ── 재고. 잠긴 재고를 풀지 않으면 팔 수 있는 물건이 묶인다
      for (const line of lines) {
        await tx.productVariant.updateMany({
          where: { id: line.variantId },
          data: { stock: { increment: line.quantity } },
        });
        quantity += line.quantity;
      }

      // ── 포인트. 잔액만 올리지 않고 원장에도 남긴다
      if (plan.points > 0) {
        await tx.user.update({
          where: { id: order.userId },
          data: { pointBalance: { increment: plan.points } },
        });
        await tx.pointTransaction.create({
          data: {
            userId: order.userId, amount: plan.points, reason: 'CANCEL_REFUND', orderId: order.id,
            note: `주문 ${order.orderNo} 일부 취소`,
          },
        });
      }

      // ── 구매확정 때 줄 적립을 남은 줄만큼으로 줄인다
      await tx.order.update({
        where: { id: order.id },
        data: { rewardPoints: { decrement: plan.rewardReduced } },
      });

      await tx.payment.update({
        where: { id: order.payment!.id },
        data: {
          status: 'PARTIAL_CANCELED',
          refundedAmount: order.payment!.refundedAmount + plan.cash,
        },
      });

      await tx.orderRefund.create({
        data: {
          orderId: order.id,
          amount: plan.cash,
          points: plan.points,
          shippingDeducted: plan.shippingDeducted,
          itemIds: [...plan.itemIds],
          kind: 'PARTIAL_CANCEL',
          reason,
          actorId: actor.id,
          idempotencyKey,
        },
      });

      await tx.orderStatusLog.create({
        data: {
          orderId: order.id, from: order.status, to: order.status, actor: actor.id,
          note: `일부 취소 ${lines.length}건 (${reason})`,
        },
      });

      refunded = plan.cash;
      pointsReturned = plan.points;
      shippingDeducted = plan.shippingDeducted;
    }, { timeout: LOCK_TIMEOUT_MS, maxWait: LOCK_TIMEOUT_MS });
  } catch (error) {
    if (pgDone) {
      /*
       * 돈은 나갔는데 장부가 없다. 같은 줄로 다시 누르면 같은 멱등 키가 나가서 돈은 두 번
       * 나가지 않고 장부만 채워진다 — 그걸 할 수 있게 무엇이 나갔는지 남긴다.
       */
      console.error('[cancel-items] 결제 취소 후 장부 반영 실패 — 다시 시도하거나 수동 대사 필요', {
        orderNo, idempotencyKey, itemIds: wanted,
      }, error);
    }
    throw error;
  }

  if (refunded > 0) {
    await recordServerEvent({
      name: 'refund',
      occurredAt: new Date(),
      sessionId: first.browserSessionId ?? `order-${orderNo}`,
      anonymousId: first.browserSessionId ?? `order-${orderNo}`,
      userId: first.userId,
      path: staff ? '/admin' : '/order',
      productId: null, variantId: null,
      orderId: orderNo,
      merchantId: null,
      value: refunded,
      quantity,
      props: { reason, partial: true, byStaff: staff },
    });
  }

  return { orderNo, kind: 'partial', refunded, pointsReturned, shippingDeducted };
}
