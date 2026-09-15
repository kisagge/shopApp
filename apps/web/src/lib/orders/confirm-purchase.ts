import 'server-only';
import { prisma, type Prisma } from '@shop/db';
import { OPEN_RETURN_STATUS, canConfirmPurchase } from '@shop/core';
import { grantPurchaseReward, type RewardGrant } from './grant-reward';

/**
 * 배송완료 주문 하나를 구매확정하고 적립을 준다 — **트랜잭션 안에서**.
 *
 * 손님이 누르는 확정과 자동 확정 배치가 이 하나를 쓴다. 둘로 적으면 한쪽만 줄 상태를 바꾸거나 이력을 빠뜨린다.
 * 조건부로 옮긴다: 그 사이 다른 쪽이 먼저 확정했거나 반품이 접수됐으면 0건이고 null 을 돌려준다 — 적립이 두 번 나가지
 * 않는다(적립 원장도 주문당 한 번만 받는다).
 */
export async function confirmDeliveredOrder(
  tx: Prisma.TransactionClient,
  order: { id: string; orderNo: string; userId: string; rewardPoints: number },
  options: { actor: string; note: string; now: Date },
): Promise<RewardGrant | null> {
  const { count } = await tx.order.updateMany({
    where: { id: order.id, status: 'DELIVERED' },
    data: { status: 'CONFIRMED', confirmedAt: options.now },
  });
  if (count === 0) return null;

  await tx.orderItem.updateMany({
    // 출고 전에 취소된 줄은 확정하지 않는다 — 취소로 남는다
    where: { orderId: order.id, canceledAt: null },
    data: { status: 'CONFIRMED' },
  });
  await tx.orderStatusLog.create({
    data: { orderId: order.id, from: 'DELIVERED', to: 'CONFIRMED', actor: options.actor, note: options.note },
  });

  return grantPurchaseReward(tx, order, options.now);
}

export class ConfirmPurchaseError extends Error {
  constructor(readonly code: 'ORDER_NOT_FOUND' | 'NOT_CONFIRMABLE', message: string, readonly status: number) {
    super(message);
    this.name = 'ConfirmPurchaseError';
  }
}

/**
 * 손님의 구매확정.
 *
 * **자기 주문만** — 조회에 userId 를 건다(남의 주문번호는 없는 주문). 배송완료이고 처리 전 반품이 없어야 한다 — 반품을
 * 걸어 둔 채 확정하면 판단 전인 반품의 창구가 닫힌다. 확정 뒤에는 단순 변심 반품이 막히고(판매자 귀책은 남는다), 그
 * 사실은 화면이 누르기 전에 말한다.
 */
export async function confirmPurchase(
  orderNo: string,
  user: { id: string },
  now: Date = new Date(),
): Promise<{ orderNo: string; rewarded: number }> {
  const order = await prisma.order.findFirst({
    where: { orderNo, userId: user.id },
    select: {
      id: true, orderNo: true, userId: true, status: true, rewardPoints: true,
      returnRequests: { where: { status: { in: [...OPEN_RETURN_STATUS] } }, take: 1, select: { id: true } },
    },
  });
  if (!order) throw new ConfirmPurchaseError('ORDER_NOT_FOUND', '주문을 찾을 수 없습니다.', 404);
  if (!canConfirmPurchase({ status: order.status, hasOpenReturn: order.returnRequests.length > 0 })) {
    throw new ConfirmPurchaseError('NOT_CONFIRMABLE', '배송완료된 주문만 구매확정할 수 있습니다.', 409);
  }

  const granted = await prisma.$transaction((tx) =>
    confirmDeliveredOrder(tx, order, { actor: user.id, note: '손님이 구매확정', now }));
  if (granted === null) {
    throw new ConfirmPurchaseError('NOT_CONFIRMABLE', '이미 처리된 주문입니다.', 409);
  }
  return { orderNo: order.orderNo, rewarded: granted.granted ? granted.amount : 0 };
}
