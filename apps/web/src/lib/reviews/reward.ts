import 'server-only';
import { rewardExpiresAt, reviewRewardToGrant } from '@shop/core';

/**
 * 리뷰 적립.
 *
 * **리뷰를 만드는 트랜잭션 안에서 부른다.** 밖에서 부르면 글은 올라갔는데 적립이 실패하는 구간이 생기고, 그건 약속한
 * 적립금을 못 받은 채 아무도 모르는 상태다 — 구매확정 적립과 같은 판단이다(grant-reward).
 *
 * **한 구매에 한 번 준다.** 셈의 기준은 리뷰가 아니라 주문 항목이다: 본인이 지운 리뷰는 행이 남지 않아 같은 구매로 다시 쓸
 * 수 있는데, 리뷰를 기준으로 세면 썼다 지웠다를 되풀이해 적립금을 찍어낼 수 있다.
 */

/** 트랜잭션 클라이언트. 필요한 만큼만 좁게 받는다 */
interface RewardTx {
  pointTransaction: {
    aggregate(args: unknown): Promise<{ _sum: { amount: number | null } }>;
    count(args: unknown): Promise<number>;
    create(args: unknown): Promise<unknown>;
  };
  user: { update(args: unknown): Promise<unknown> };
}

export async function grantReviewReward(
  tx: RewardTx,
  input: {
    readonly userId: string;
    readonly orderItemId: string;
    readonly hasPhoto: boolean;
    /**
     * 차액만 주는 자리인가(리뷰를 고쳐 사진을 붙였을 때).
     *
     * **한 번도 적립된 적이 없는 글에는 주지 않는다.** 적립을 두기 전에 쓴 글이 오타 하나 고쳤다는 이유로 적립을 받으면,
     * 그건 후기를 쓴 값이 아니라 저장을 누른 값이 된다.
     */
    readonly topUpOnly?: boolean;
  },
  now = new Date(),
): Promise<number> {
  const already = await tx.pointTransaction.aggregate({
    where: { orderItemId: input.orderItemId, reason: 'EARN_REVIEW' },
    _sum: { amount: true },
  });

  const alreadyGranted = already._sum.amount ?? 0;
  if (input.topUpOnly && alreadyGranted === 0) return 0;

  /*
   * **돌려받은 줄이면 더 주지 않는다.** 반품하면 이 줄의 후기 적립을 되가져가는데(reclaimReviewReward), 그 뒤에 후기를
   * 고쳐 사진을 붙이면 "받은 것" 은 여전히 원래 합으로 세어져 차액이 다시 나갔다.
   */
  if (alreadyGranted > 0) {
    const reclaimed = await tx.pointTransaction.count({
      where: { orderItemId: input.orderItemId, reason: 'ADMIN_ADJUST', amount: { lt: 0 }, orderId: null },
    });
    if (reclaimed > 0) return 0;
  }

  const amount = reviewRewardToGrant({ hasPhoto: input.hasPhoto, alreadyGranted });
  if (amount === 0) return 0;

  await tx.pointTransaction.create({
    data: {
      userId: input.userId,
      amount,
      reason: 'EARN_REVIEW',
      orderItemId: input.orderItemId,
      note: input.hasPhoto ? '사진 후기 적립' : '후기 적립',
      // 무기한으로 두면 부채가 계속 쌓이고 언제 털어야 할지 알 수 없다 — 구매 적립과 같은 기한
      expiresAt: rewardExpiresAt(now),
    },
  });

  /*
   * 잔액은 캐시다. 원장이 진실이므로 증분으로 올린다 — 여기서 합계를 다시 세어 덮어쓰면
   * 같은 순간 들어온 다른 적립·사용을 지운다.
   */
  await tx.user.update({
    where: { id: input.userId },
    data: { pointBalance: { increment: amount } },
  });

  return amount;
}
