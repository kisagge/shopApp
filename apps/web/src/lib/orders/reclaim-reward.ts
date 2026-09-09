import 'server-only';

/**
 * 구매확정으로 준 적립을 되가져온다.
 *
 * 확정 뒤에도 하자 반품을 받게 되면서 생긴 자리다. 확정하면 적립이 나가는데
 * (`grant-reward`), 그 주문이 반품·환불되면 **물건도 돌아오고 돈도 돌아가는데
 * 적립만 남는다.** 확정 → 적립 → 하자 반품을 되풀이하면 그만큼이 계속 쌓인다.
 *
 * **두 번 빼지 않는다.** 같은 주문의 회수 원장이 이미 있으면 아무것도 하지
 * 않는다 — 적립 지급이 같은 방식으로 두 번 주지 않는 것과 같은 이유다.
 *
 * **잔액이 모자라면 있는 만큼만 뺀다.** 이미 써 버렸을 수 있고, 그때 잔액을
 * 음수로 만들면 그 사람은 다음 적립이 그 구멍을 메울 때까지 아무것도 쓸 수
 * 없게 된다. 우리가 준 것을 되가져오는 일이 사용자를 빚진 상태로 만들면
 * 안 된다 — 못 가져온 몫은 우리가 감수한다.
 */

interface ReclaimTx {
  pointTransaction: {
    findFirst(args: unknown): Promise<{ id: string; amount: number } | null>;
    create(args: unknown): Promise<unknown>;
  };
  user: {
    findUnique(args: unknown): Promise<{ pointBalance: number } | null>;
    update(args: unknown): Promise<unknown>;
  };
}

export interface RewardReclaim {
  readonly reclaimed: number;
  /** 잔액이 모자라 못 가져온 몫. 0 이 아니면 그만큼은 우리가 감수한 것이다. */
  readonly shortfall: number;
}

export async function reclaimPurchaseReward(
  tx: ReclaimTx,
  order: { id: string; orderNo: string; userId: string },
): Promise<RewardReclaim> {
  const granted = await tx.pointTransaction.findFirst({
    where: { orderId: order.id, reason: 'EARN_PURCHASE' },
    select: { id: true, amount: true },
  });
  // 확정에 이르지 못한 주문이면 줄 적립도 없었다
  if (granted === null || granted.amount <= 0) return { reclaimed: 0, shortfall: 0 };

  const already = await tx.pointTransaction.findFirst({
    where: { orderId: order.id, reason: 'ADMIN_ADJUST', amount: { lt: 0 } },
    select: { id: true, amount: true },
  });
  if (already !== null) return { reclaimed: 0, shortfall: 0 };

  const user = await tx.user.findUnique({
    where: { id: order.userId },
    select: { pointBalance: true },
  });
  const balance = user?.pointBalance ?? 0;
  const take = Math.min(granted.amount, Math.max(balance, 0));
  const shortfall = granted.amount - take;

  if (take === 0) return { reclaimed: 0, shortfall };

  await tx.user.update({
    where: { id: order.userId },
    data: { pointBalance: { decrement: take } },
  });
  await tx.pointTransaction.create({
    data: {
      userId: order.userId,
      amount: -take,
      reason: 'ADMIN_ADJUST',
      orderId: order.id,
      note:
        shortfall === 0
          ? `주문 ${order.orderNo} 반품 — 구매확정 적립 회수`
          : `주문 ${order.orderNo} 반품 — 구매확정 적립 회수 (잔액 부족 ${shortfall}P 미회수)`,
    },
  });

  return { reclaimed: take, shortfall };
}
