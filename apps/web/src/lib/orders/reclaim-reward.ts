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
    findMany(args: unknown): Promise<{ amount: number }[]>;
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

/**
 * @param share 되가져올 몫. **줄 하나만 반품하면 그 줄의 적립 몫만** 가져온다 — 나머지 줄은
 *   여전히 산 것이다. 비우면 남은 적립 전부(주문째 환불).
 *
 * **이미 가져간 만큼은 빼고 센다.** 예전에는 회수 원장이 하나라도 있으면 아무것도 안 했다.
 * 줄 단위 반품이 생기자 그 원장은 "일부만 가져갔다" 일 수 있게 됐고, 그대로 두면 나중에
 * 나머지를 반품해도 **남은 적립을 영영 안 가져온다.**
 */
export async function reclaimPurchaseReward(
  tx: ReclaimTx,
  order: { id: string; orderNo: string; userId: string },
  share?: number,
): Promise<RewardReclaim> {
  const granted = await tx.pointTransaction.findFirst({
    where: { orderId: order.id, reason: 'EARN_PURCHASE' },
    select: { id: true, amount: true },
  });
  // 확정에 이르지 못한 주문이면 줄 적립도 없었다
  if (granted === null || granted.amount <= 0) return { reclaimed: 0, shortfall: 0 };

  const earlier = await tx.pointTransaction.findMany({
    where: { orderId: order.id, reason: 'ADMIN_ADJUST', amount: { lt: 0 } },
    select: { amount: true },
  });
  const taken = earlier.reduce((sum, row) => sum - row.amount, 0);
  const left = Math.max(0, granted.amount - taken);
  const target = Math.min(share ?? left, left);
  if (target <= 0) return { reclaimed: 0, shortfall: 0 };

  const user = await tx.user.findUnique({
    where: { id: order.userId },
    select: { pointBalance: true },
  });
  const balance = user?.pointBalance ?? 0;
  const take = Math.min(target, Math.max(balance, 0));
  const shortfall = target - take;

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

interface ReviewReclaimTx {
  pointTransaction: {
    groupBy(args: unknown): Promise<{ orderItemId: string | null; reason: string; _sum: { amount: number | null } }[]>;
    create(args: unknown): Promise<unknown>;
  };
  user: {
    findUnique(args: unknown): Promise<{ pointBalance: number } | null>;
    update(args: unknown): Promise<unknown>;
  };
}

/**
 * 돌려받은 줄에 준 **후기 적립**을 되가져온다.
 *
 * 후기 적립은 줄(주문 항목)마다 나간다. 구매확정 적립만 되가져오고 이것은 두었더니, 받고 → 사진 후기를
 * 쓰고 → 반품하면 물건도 돈도 돌아가는데 후기 적립만 남았다. 되풀이하면 그만큼 쌓인다.
 *
 * 회수 원장은 **그 줄을 가리키는 음수 조정**으로 남긴다(주문은 가리키지 않는다 — 주문을 가리키는 음수
 * 조정은 구매확정 적립 회수의 몫이라 섞이면 그쪽이 덜 가져간다). 이미 가져간 만큼은 빼고 세므로 두 번
 * 부르거나 줄을 나눠 반품해도 두 번 빼지 않는다. 잔액이 모자라면 있는 만큼만 — 구매확정 적립과 같은 판단이다.
 */
export async function reclaimReviewReward(
  tx: ReviewReclaimTx,
  order: { orderNo: string; userId: string },
  itemIds: readonly string[],
): Promise<RewardReclaim> {
  if (itemIds.length === 0) return { reclaimed: 0, shortfall: 0 };

  const rows = await tx.pointTransaction.groupBy({
    by: ['orderItemId', 'reason'],
    where: {
      orderItemId: { in: [...itemIds] },
      OR: [{ reason: 'EARN_REVIEW' }, { reason: 'ADMIN_ADJUST', amount: { lt: 0 }, orderId: null }],
    },
    _sum: { amount: true },
  });
  const owed = new Map<string, number>();
  for (const row of rows) {
    if (row.orderItemId === null) continue;
    // 준 것은 양수, 가져간 것은 음수로 쌓인다 — 더하면 남은 몫이다
    owed.set(row.orderItemId, (owed.get(row.orderItemId) ?? 0) + (row._sum.amount ?? 0));
  }
  const targets = [...itemIds].map((id) => ({ id, amount: Math.max(0, owed.get(id) ?? 0) })).filter((t) => t.amount > 0);
  if (targets.length === 0) return { reclaimed: 0, shortfall: 0 };

  const user = await tx.user.findUnique({ where: { id: order.userId }, select: { pointBalance: true } });
  let balance = Math.max(user?.pointBalance ?? 0, 0);
  let reclaimed = 0;
  let shortfall = 0;

  for (const target of targets) {
    const take = Math.min(target.amount, balance);
    shortfall += target.amount - take;
    if (take === 0) continue;
    balance -= take;
    reclaimed += take;
    await tx.pointTransaction.create({
      data: {
        userId: order.userId,
        amount: -take,
        reason: 'ADMIN_ADJUST',
        orderItemId: target.id,
        note:
          take === target.amount
            ? `주문 ${order.orderNo} 반품 — 후기 적립 회수`
            : `주문 ${order.orderNo} 반품 — 후기 적립 회수 (잔액 부족 ${target.amount - take}P 미회수)`,
      },
    });
  }

  if (reclaimed > 0) {
    await tx.user.update({ where: { id: order.userId }, data: { pointBalance: { decrement: reclaimed } } });
  }
  return { reclaimed, shortfall };
}
