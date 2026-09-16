import { describe, it, expect, vi, beforeEach } from 'vitest';
import { REVIEW_REWARD } from '@shop/core';

/**
 * 리뷰 적립 지급.
 *
 * **셈의 기준은 리뷰가 아니라 주문 항목이다.** 본인이 지운 리뷰는 행이 남지 않아 같은 구매로 다시 쓸 수 있는데, 리뷰를
 * 기준으로 세면 썼다 지웠다를 되풀이해 적립금을 찍어낼 수 있다.
 */

const { grantReviewReward } = await import('~/lib/reviews/reward');

const tx = {
  pointTransaction: {
    aggregate: vi.fn<(...a: any[]) => any>(),
    create: vi.fn<(...a: any[]) => any>(),
  },
  user: { update: vi.fn<(...a: any[]) => any>() },
};

const input = { userId: 'u-1', orderItemId: 'oi-1', hasPhoto: false };

const granted = (amount: number | null) => {
  tx.pointTransaction.aggregate.mockResolvedValue({ _sum: { amount } });
};

beforeEach(() => {
  vi.clearAllMocks();
  granted(null);
});

describe('리뷰 적립', () => {
  it('처음 쓰면 글 값을 주고 잔액을 올린다', async () => {
    expect(await grantReviewReward(tx, input)).toBe(REVIEW_REWARD.text);

    expect(tx.pointTransaction.create.mock.calls[0]![0].data).toMatchObject({
      userId: 'u-1', amount: REVIEW_REWARD.text, reason: 'EARN_REVIEW', orderItemId: 'oi-1',
    });
    // 잔액은 캐시다. 합계를 다시 세어 덮어쓰면 같은 순간의 다른 적립·사용을 지운다
    expect(tx.user.update.mock.calls[0]![0].data).toEqual({ pointBalance: { increment: REVIEW_REWARD.text } });
  });

  it('사진이 있으면 더 준다', async () => {
    expect(await grantReviewReward(tx, { ...input, hasPhoto: true })).toBe(REVIEW_REWARD.photo);
  });

  it('소멸 예정일을 함께 적는다 — 무기한이면 부채가 계속 쌓인다', async () => {
    await grantReviewReward(tx, input, new Date('2026-09-16T00:00:00Z'));
    expect(tx.pointTransaction.create.mock.calls[0]![0].data.expiresAt).toBeInstanceOf(Date);
  });

  it('같은 구매로 다시 써도 두 번 주지 않는다', async () => {
    // 지웠다 다시 쓴 자리다 — 리뷰 행은 없지만 원장이 기억한다
    granted(REVIEW_REWARD.text);
    expect(await grantReviewReward(tx, input)).toBe(0);
    expect(tx.pointTransaction.create).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('사진을 나중에 붙이면 차액만 준다', async () => {
    granted(REVIEW_REWARD.text);
    const diff = REVIEW_REWARD.photo - REVIEW_REWARD.text;
    expect(await grantReviewReward(tx, { ...input, hasPhoto: true, topUpOnly: true })).toBe(diff);
    expect(tx.pointTransaction.create.mock.calls[0]![0].data.amount).toBe(diff);
  });

  it('적립을 받은 적 없는 글은 고쳐도 주지 않는다', async () => {
    /*
     * 적립을 두기 전에 쓴 글이 오타 하나 고쳤다는 이유로 적립을 받으면, 그건 후기를 쓴 값이 아니라 저장을 누른 값이 된다.
     */
    granted(null);
    expect(await grantReviewReward(tx, { ...input, hasPhoto: true, topUpOnly: true })).toBe(0);
    expect(tx.pointTransaction.create).not.toHaveBeenCalled();
  });

  it('사진을 뺐다고 빼앗지 않는다', async () => {
    granted(REVIEW_REWARD.photo);
    expect(await grantReviewReward(tx, { ...input, hasPhoto: false, topUpOnly: true })).toBe(0);
    expect(tx.user.update).not.toHaveBeenCalled();
  });
});
