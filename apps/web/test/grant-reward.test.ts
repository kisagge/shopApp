import { describe, it, expect, vi, beforeEach } from 'vitest';

const tx = vi.hoisted(() => ({
  pointTransaction: {
    findFirst: vi.fn<(...a: any[]) => any>(),
    create: vi.fn<(...a: any[]) => any>(),
  },
  user: { update: vi.fn<(...a: any[]) => any>() },
}));

const { grantPurchaseReward } = await import('~/lib/orders/grant-reward');

const order = { id: 'o-1', orderNo: '20260901-0000001', userId: 'u-1', rewardPoints: 2890 };
const now = new Date('2026-09-10T00:00:00+09:00');

beforeEach(() => {
  vi.clearAllMocks();
  tx.pointTransaction.findFirst.mockResolvedValue(null);
});

describe('적립 지급', () => {
  it('원장에 양수로 남긴다 — 합계가 곧 잔액이다', async () => {
    const r = await grantPurchaseReward(tx, order, now);

    expect(r).toMatchObject({ granted: true, amount: 2890 });
    expect(tx.pointTransaction.create.mock.calls[0]?.[0].data).toMatchObject({
      userId: 'u-1', amount: 2890, reason: 'EARN_PURCHASE', orderId: 'o-1',
    });
  });

  it('소멸 예정일을 함께 박는다 — 무기한이면 부채가 계속 쌓인다', async () => {
    await grantPurchaseReward(tx, order, now);

    const expiresAt = tx.pointTransaction.create.mock.calls[0]?.[0].data.expiresAt as Date;
    const days = Math.round((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    expect(days).toBe(365);
  });

  it('잔액은 증분으로 올린다 — 합계를 다시 세어 덮으면 동시 거래를 지운다', async () => {
    await grantPurchaseReward(tx, order, now);

    expect(tx.user.update.mock.calls[0]?.[0].data).toEqual({
      pointBalance: { increment: 2890 },
    });
  });

  it('주문에 저장된 값을 쓴다 — 확정 시점에 다시 계산하지 않는다', async () => {
    // 등급이 내려갔어도 약속한 값을 준다
    await grantPurchaseReward(tx, { ...order, rewardPoints: 5000 }, now);

    expect(tx.pointTransaction.create.mock.calls[0]?.[0].data.amount).toBe(5000);
  });
});

describe('두 번 주지 않는다', () => {
  it('같은 주문에 이미 적립이 있으면 아무것도 하지 않는다', async () => {
    tx.pointTransaction.findFirst.mockResolvedValue({ id: 'pt-1' });

    const r = await grantPurchaseReward(tx, order, now);

    expect(r.granted).toBe(false);
    expect(tx.pointTransaction.create).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('EARN_PURCHASE 만 본다 — 같은 주문의 사용 내역과 헷갈리면 안 된다', async () => {
    await grantPurchaseReward(tx, order, now);

    expect(tx.pointTransaction.findFirst.mock.calls[0]?.[0].where).toEqual({
      orderId: 'o-1', reason: 'EARN_PURCHASE',
    });
  });
});

describe('줄 것이 없으면', () => {
  it('0원이면 원장에 남기지 않는다 — 잔액에 영향도 없이 내역만 어지럽힌다', async () => {
    const r = await grantPurchaseReward(tx, { ...order, rewardPoints: 0 }, now);

    expect(r.granted).toBe(false);
    expect(tx.pointTransaction.create).not.toHaveBeenCalled();
  });

  it('음수도 지급하지 않는다', async () => {
    const r = await grantPurchaseReward(tx, { ...order, rewardPoints: -100 }, now);

    expect(r.granted).toBe(false);
    expect(tx.user.update).not.toHaveBeenCalled();
  });
});
