import 'server-only';
import { rewardExpiresAt, rewardToGrant } from '@shop/core';

/**
 * 구매확정 적립.
 *
 * 주문이 실제로 CONFIRMED 로 넘어간 **그 트랜잭션 안에서** 부른다.
 * 밖에서 부르면 상태는 바뀌었는데 적립이 실패하는 구간이 생기고,
 * 그건 고객이 약속받은 포인트를 못 받은 채 아무도 모르는 상태다.
 *
 * **두 번 주지 않는 것이 전부다.** 포인트는 돈이고, 한 번 더 준 것을
 * 회수하려면 이미 쓴 사람에게서 빼앗아야 하는데 그건 대개 불가능하다.
 * 두 겹으로 막는다.
 * 1. 호출부가 조건부 UPDATE 로 "내가 확정시킨 것" 임을 확인한 뒤에만 부른다
 * 2. 여기서 같은 주문의 EARN_PURCHASE 원장이 이미 있는지 다시 본다
 */

/** 트랜잭션 클라이언트. 필요한 만큼만 좁게 받는다. */
interface RewardTx {
  pointTransaction: {
    findFirst(args: unknown): Promise<{ id: string } | null>;
    create(args: unknown): Promise<unknown>;
  };
  user: { update(args: unknown): Promise<unknown> };
}

export interface RewardGrant {
  readonly granted: boolean;
  readonly amount: number;
  readonly reason?: string;
}

export async function grantPurchaseReward(
  tx: RewardTx,
  order: { id: string; orderNo: string; userId: string; rewardPoints: number },
  now = new Date(),
): Promise<RewardGrant> {
  const amount = rewardToGrant(order.rewardPoints);
  if (amount === 0) return { granted: false, amount: 0, reason: '적립할 금액이 없습니다' };

  // 이미 준 적이 있으면 아무것도 하지 않는다
  const existing = await tx.pointTransaction.findFirst({
    where: { orderId: order.id, reason: 'EARN_PURCHASE' },
    select: { id: true },
  });
  if (existing) return { granted: false, amount: 0, reason: '이미 적립된 주문입니다' };

  await tx.pointTransaction.create({
    data: {
      userId: order.userId,
      amount,
      reason: 'EARN_PURCHASE',
      orderId: order.id,
      note: `주문 ${order.orderNo} 구매확정 적립`,
      // 무기한으로 두면 부채가 계속 쌓이고 언제 털어야 할지 알 수 없다
      expiresAt: rewardExpiresAt(now),
    },
  });

  /**
   * 잔액은 캐시다. 원장이 진실이므로 증분으로 올린다.
   *
   * 여기서 합계를 다시 세어 덮어쓰지 않는다 — 같은 순간 다른 적립·사용이
   * 들어오면 그 값을 지운다. increment 는 DB 가 직렬화해 준다.
   */
  await tx.user.update({
    where: { id: order.userId },
    data: { pointBalance: { increment: amount } },
  });

  return { granted: true, amount };
}
