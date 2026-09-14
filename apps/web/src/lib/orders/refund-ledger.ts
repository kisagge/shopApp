import 'server-only';

/**
 * 이 주문에서 **이미 돌려준 것**.
 *
 * 부분 취소가 생기면서 전액 취소·환불도 "주문에 적힌 결제액을 통째로" 돌려주면 안 되게
 * 됐다. 한 줄을 먼저 취소한 주문을 나중에 전부 취소하면 그 줄 몫이 두 번 나간다. 그래서
 * 돌려줄 것은 언제나 **받은 것 − 이미 돌려준 것**이고, 이미 돌려준 것은 환불 기록의 합이다.
 *
 * **옛 주문.** 부분 취소 전에는 환불 기록이 없고, 포인트를 돌려줬는지는 원장(CANCEL_REFUND)
 * 에만 남았다. 결제된 환불은 마이그레이션이 옮겨 적었지만 결제 전 취소는 옮기지 않았다
 * (매출에 안 잡히는 것이라). 기록이 하나도 없는데 원장에 돌려준 흔적이 있으면 포인트는
 * 이미 전부 돌려준 것으로 본다 — 예전 환불이 원장으로 두 번 주기를 막던 방식 그대로다.
 */

interface LedgerDb {
  orderRefund: {
    aggregate(args: {
      where: { orderId: string };
      _sum: { amount: true; points: true; shippingDeducted: true };
      _count: { _all: true };
    }): Promise<{
      _sum: { amount: number | null; points: number | null; shippingDeducted: number | null };
      _count: { _all: number };
    }>;
  };
  pointTransaction: {
    findFirst(args: unknown): Promise<{ id: string } | null>;
  };
}

export interface RefundedSoFar {
  readonly cash: number;
  readonly points: number;
  readonly shippingDeducted: number;
}

export async function refundedSoFar(
  db: LedgerDb,
  order: { readonly id: string; readonly pointsUsed: number },
): Promise<RefundedSoFar> {
  const agg = await db.orderRefund.aggregate({
    where: { orderId: order.id },
    _sum: { amount: true, points: true, shippingDeducted: true },
    _count: { _all: true },
  });

  let points = agg._sum.points ?? 0;
  if (agg._count._all === 0 && order.pointsUsed > 0) {
    const legacy = await db.pointTransaction.findFirst({
      where: { orderId: order.id, reason: 'CANCEL_REFUND' },
      select: { id: true },
    });
    if (legacy) points = order.pointsUsed;
  }

  return {
    cash: agg._sum.amount ?? 0,
    points,
    shippingDeducted: agg._sum.shippingDeducted ?? 0,
  };
}
