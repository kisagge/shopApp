import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reclaimPurchaseReward } from '~/lib/orders/reclaim-reward';

/**
 * 구매확정으로 준 적립을 되가져온다.
 *
 * 확정 뒤에도 하자 반품을 받게 되면서 생긴 자리다. 물건도 돌아오고 돈도
 * 돌아가는데 적립만 남으면, 확정 → 적립 → 하자 반품을 되풀이하는 만큼 쌓인다.
 * 아무도 터지지 않고 잔액만 늘어나는 종류라 검사로 막는다.
 */

const tx = () => ({
  pointTransaction: {
    findFirst: vi.fn<(...a: any[]) => any>(),
    findMany: vi.fn<(...a: any[]) => any>(async () => []),
    create: vi.fn<(...a: any[]) => any>(),
  },
  user: {
    findUnique: vi.fn<(...a: any[]) => any>(),
    update: vi.fn<(...a: any[]) => any>(),
  },
});

const order = { id: 'o-1', orderNo: '20260909-0000001', userId: 'u-1' };

/** 적립 원장은 있고, 회수 원장은 없고, 잔액은 이만큼 */
function granted(t: ReturnType<typeof tx>, amount: number, balance: number) {
  t.pointTransaction.findFirst.mockResolvedValueOnce({ id: 'pt-1', amount });
  t.pointTransaction.findMany.mockResolvedValueOnce([]);
  t.user.findUnique.mockResolvedValue({ pointBalance: balance });
}

let t: ReturnType<typeof tx>;
beforeEach(() => { t = tx(); });

describe('적립 회수', () => {
  it('준 만큼 되가져온다', async () => {
    granted(t, 2_890, 10_000);

    const out = await reclaimPurchaseReward(t, order);

    expect(out).toEqual({ reclaimed: 2_890, shortfall: 0 });
    expect(t.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { pointBalance: { decrement: 2_890 } } }),
    );
  });

  it('원장에 음수로 남긴다 — 잔액만 줄이면 왜 줄었는지 아무도 모른다', async () => {
    granted(t, 2_890, 10_000);

    await reclaimPurchaseReward(t, order);

    const [args] = t.pointTransaction.create.mock.calls[0] as [{ data: Record<string, unknown> }];
    expect(args.data['amount']).toBe(-2_890);
    expect(args.data['orderId']).toBe('o-1');
    expect(args.data['note']).toContain('20260909-0000001');
  });

  /** 확정에 이른 적 없는 주문이면 줄 적립도 없었다 */
  it('적립한 적이 없으면 아무것도 하지 않는다', async () => {
    t.pointTransaction.findFirst.mockResolvedValue(null);

    const out = await reclaimPurchaseReward(t, order);

    expect(out).toEqual({ reclaimed: 0, shortfall: 0 });
    expect(t.user.update).not.toHaveBeenCalled();
  });

  /** 잔액만 두 번 줄면 아무도 알아채지 못한다 — 적립 지급이 두 번 주지 않는 것과 같은 이유다 */
  it('두 번 부르면 두 번째는 아무것도 하지 않는다', async () => {
    t.pointTransaction.findFirst.mockResolvedValueOnce({ id: 'pt-1', amount: 2_890 });
    t.pointTransaction.findMany.mockResolvedValueOnce([{ amount: -2_890 }]);

    const out = await reclaimPurchaseReward(t, order);

    expect(out).toEqual({ reclaimed: 0, shortfall: 0 });
    expect(t.user.update).not.toHaveBeenCalled();
  });

  /**
   * 이미 써 버렸을 수 있다. 잔액을 음수로 만들면 그 사람은 다음 적립이 그
   * 구멍을 메울 때까지 아무것도 쓸 수 없다 — 우리가 준 것을 되가져오는 일이
   * 사용자를 빚진 상태로 만들면 안 된다.
   */
  it('잔액이 모자라면 있는 만큼만 뺀다', async () => {
    granted(t, 2_890, 1_000);

    const out = await reclaimPurchaseReward(t, order);

    expect(out).toEqual({ reclaimed: 1_000, shortfall: 1_890 });
    expect(t.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { pointBalance: { decrement: 1_000 } } }),
    );
  });

  it('못 가져온 몫을 원장에 적어 둔다 — 나중에 왜 모자란지 알 수 있어야 한다', async () => {
    granted(t, 2_890, 1_000);

    await reclaimPurchaseReward(t, order);

    const [args] = t.pointTransaction.create.mock.calls[0] as [{ data: Record<string, unknown> }];
    expect(String(args.data['note'])).toContain('1890');
  });

  it('잔액이 0 이면 원장도 남기지 않는다 — 0 원짜리 줄은 읽는 사람만 헷갈린다', async () => {
    granted(t, 2_890, 0);

    const out = await reclaimPurchaseReward(t, order);

    expect(out).toEqual({ reclaimed: 0, shortfall: 2_890 });
    expect(t.pointTransaction.create).not.toHaveBeenCalled();
    expect(t.user.update).not.toHaveBeenCalled();
  });

  it('잔액이 음수여도 더 빼지 않는다', async () => {
    granted(t, 2_890, -500);

    const out = await reclaimPurchaseReward(t, order);

    expect(out.reclaimed).toBe(0);
    expect(t.user.update).not.toHaveBeenCalled();
  });

  it('줄 하나만 반품하면 그 줄의 몫만 가져온다', async () => {
    granted(t, 2_890, 10_000);
    const out = await reclaimPurchaseReward(t, order, 890);
    expect(out).toEqual({ reclaimed: 890, shortfall: 0 });
  });

  it('앞서 일부 가져갔으면 나머지만 가져온다 — 일부 회수가 전체 회수를 막지 않는다', async () => {
    /*
     * 예전에는 회수 원장이 하나라도 있으면 건너뛰었다. 줄 하나를 반품한 뒤 나머지를 반품하면
     * 남은 적립을 영영 안 가져왔을 것이다.
     */
    t.pointTransaction.findFirst.mockResolvedValueOnce({ id: 'pt-1', amount: 2_890 });
    t.pointTransaction.findMany.mockResolvedValueOnce([{ amount: -890 }]);
    t.user.findUnique.mockResolvedValue({ pointBalance: 10_000 });

    const out = await reclaimPurchaseReward(t, order);
    expect(out).toEqual({ reclaimed: 2_000, shortfall: 0 });
  });

  it('몫이 남은 적립보다 크면 남은 만큼만 가져온다', async () => {
    t.pointTransaction.findFirst.mockResolvedValueOnce({ id: 'pt-1', amount: 1_000 });
    t.pointTransaction.findMany.mockResolvedValueOnce([{ amount: -800 }]);
    t.user.findUnique.mockResolvedValue({ pointBalance: 10_000 });

    const out = await reclaimPurchaseReward(t, order, 500);
    expect(out.reclaimed).toBe(200);
  });
});
