import { describe, it, expect, vi } from 'vitest';
import { refundedSoFar } from '~/lib/orders/refund-ledger';

/**
 * 이 주문에서 **이미 돌려준 것.**
 *
 * 검사가 한 줄도 없었다. 돈이 두 번 나가는 것을 막는 자리인데 그렇다 — 부분 취소가 생기면서
 * 전액 취소·환불도 "주문에 적힌 결제액을 통째로" 돌려주면 안 되게 됐다. 한 줄을 먼저 취소한
 * 주문을 나중에 전부 취소하면 그 줄 몫이 **두 번** 나간다.
 *
 * 돌려줄 것은 언제나 **받은 것 − 이미 돌려준 것**이고, 이 함수가 뒤엣것을 센다. 네 자리가
 * 이것을 쓴다(주문 취소·환불·반품 완료·일부 취소).
 */

const ledger = (over: {
  sum?: { amount?: number | null; points?: number | null; shippingDeducted?: number | null };
  count?: number;
  legacy?: { id: string } | null;
} = {}) => {
  const aggregate = vi.fn(async () => ({
    _sum: {
      amount: over.sum?.amount ?? null,
      points: over.sum?.points ?? null,
      shippingDeducted: over.sum?.shippingDeducted ?? null,
    },
    _count: { _all: over.count ?? 0 },
  }));
  const findFirst = vi.fn(async () => over.legacy ?? null);
  return { db: { orderRefund: { aggregate }, pointTransaction: { findFirst } }, aggregate, findFirst };
};

const order = (pointsUsed = 0) => ({ id: 'o-1', pointsUsed });

describe('이미 돌려준 것을 센다', () => {
  it('환불 기록의 합을 돌려준다', async () => {
    const { db } = ledger({ sum: { amount: 12_000, points: 3_000, shippingDeducted: 2_500 }, count: 2 });

    expect(await refundedSoFar(db, order(5_000))).toEqual({
      cash: 12_000, points: 3_000, shippingDeducted: 2_500,
    });
  });

  /** 합이 없으면 null 이 온다 — 0 으로 읽지 않으면 뺄셈이 NaN 이 된다 */
  it('기록이 없으면 0 이다', async () => {
    const { db } = ledger();

    expect(await refundedSoFar(db, order())).toEqual({ cash: 0, points: 0, shippingDeducted: 0 });
  });

  it('그 주문의 기록만 센다', async () => {
    const { db, aggregate } = ledger({ count: 1 });

    await refundedSoFar(db, order());

    expect(aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: { orderId: 'o-1' } }));
  });

  /** 배송비 차감분도 함께 센다 — 일부 취소가 다음 셈에 그 값을 넣는다 */
  it('배송비 차감분을 함께 돌려준다', async () => {
    const { db } = ledger({ sum: { shippingDeducted: 3_000 }, count: 1 });

    expect((await refundedSoFar(db, order())).shippingDeducted).toBe(3_000);
  });
});

/**
 * **옛 주문.**
 *
 * 부분 취소 전에는 환불 기록이 없고, 포인트를 돌려줬는지는 원장(CANCEL_REFUND)에만 남았다.
 * 결제된 환불은 마이그레이션이 옮겨 적었지만 결제 전 취소는 옮기지 않았다 — 매출에 안 잡히는
 * 것이라. 기록이 하나도 없는데 원장에 흔적이 있으면 포인트는 **이미 전부 돌려준 것**으로 본다.
 * 예전 환불이 원장으로 두 번 주기를 막던 방식 그대로다.
 */
describe('기록이 없는 옛 주문', () => {
  it('원장에 흔적이 있으면 쓴 포인트를 전부 돌려준 것으로 본다', async () => {
    const { db } = ledger({ count: 0, legacy: { id: 'pt-1' } });

    expect((await refundedSoFar(db, order(5_000))).points).toBe(5_000);
  });

  it('원장에도 흔적이 없으면 아직 안 돌려준 것이다', async () => {
    const { db } = ledger({ count: 0, legacy: null });

    expect((await refundedSoFar(db, order(5_000))).points).toBe(0);
  });

  it('그 주문의 취소 환불 기록만 찾는다', async () => {
    const { db, findFirst } = ledger({ count: 0, legacy: { id: 'pt-1' } });

    await refundedSoFar(db, order(5_000));

    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { orderId: 'o-1', reason: 'CANCEL_REFUND' },
    }));
  });

  /** 쓴 포인트가 없으면 돌려줄 것도 없다 — 물어볼 까닭도 없다 */
  it('쓴 포인트가 없으면 원장을 뒤지지 않는다', async () => {
    const { db, findFirst } = ledger({ count: 0 });

    await refundedSoFar(db, order(0));

    expect(findFirst).not.toHaveBeenCalled();
  });

  /*
   * **기록이 하나라도 있으면 그것이 진실이다.** 그때까지 원장을 보면, 이미 한 줄을 취소해
   * 일부를 돌려준 주문에서 "전부 돌려줬다" 로 읽혀 나머지가 영영 안 나간다.
   */
  it('기록이 있으면 원장을 보지 않는다', async () => {
    const { db, findFirst } = ledger({ sum: { points: 1_000 }, count: 1, legacy: { id: 'pt-1' } });

    const result = await refundedSoFar(db, order(5_000));

    expect(findFirst).not.toHaveBeenCalled();
    expect(result.points).toBe(1_000);
  });

  /** 옛 주문 판단은 포인트에만 쓴다 — 현금과 배송비는 기록이 진실이다 */
  it('옛 주문이어도 현금은 기록대로다', async () => {
    const { db } = ledger({ count: 0, legacy: { id: 'pt-1' } });

    const result = await refundedSoFar(db, order(5_000));

    expect(result.cash).toBe(0);
    expect(result.shippingDeducted).toBe(0);
  });
});
