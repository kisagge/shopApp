import 'server-only';
import { prisma } from '@shop/db';
import { AUTO_CONFIRM_DAYS, OPEN_RETURN_STATUS, isAutoConfirmable } from '@shop/core';
import { confirmDeliveredOrder } from './confirm-purchase';

/**
 * 자동 구매확정.
 *
 * 대부분의 사람은 확정 버튼을 누르지 않는다. 자동 확정이 없으면 주문은
 * 배송완료에 머물고 **적립은 영원히 나가지 않는다** — 적립 예정 포인트만
 * 화면에 떠 있고 실제로는 아무 일도 일어나지 않는 상태가 된다.
 *
 * 반품 신청 기한보다 늦게 확정한다. 확정되면 반품 창구가 닫히므로,
 * 기한이 남았는데 먼저 확정돼 버리면 안 된다.
 */

export interface AutoConfirmResult {
  readonly confirmed: number;
  readonly rewarded: number;
  readonly skipped: number;
  readonly orderNos: readonly string[];
}

/**
 * 한 번에 처리할 주문 수.
 *
 * 서버리스는 실행 시간 제한이 있다. 밀린 것을 한 번에 다 처리하려 들면
 * 중간에 끊기고, 그러면 어디까지 했는지도 모른 채 남는다. 조금씩 따라잡는다.
 */
const MAX_PER_RUN = 200;

export async function autoConfirmDelivered(
  now = new Date(),
  options: { days?: number; limit?: number } = {},
): Promise<AutoConfirmResult> {
  const days = options.days ?? AUTO_CONFIRM_DAYS;
  const due = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const candidates = await prisma.order.findMany({
    where: {
      status: 'DELIVERED',
      deliveredAt: { not: null, lte: due },
    },
    orderBy: { deliveredAt: 'asc' },
    take: options.limit ?? MAX_PER_RUN,
    select: {
      id: true, orderNo: true, status: true, userId: true,
      deliveredAt: true, rewardPoints: true,
      // 처리 전인 반품 신청이 있으면 확정하지 않는다
      returnRequests: {
        where: { status: { in: [...OPEN_RETURN_STATUS] } },
        take: 1,
        select: { id: true },
      },
    },
  });

  const orderNos: string[] = [];
  let rewarded = 0;
  let skipped = 0;

  for (const order of candidates) {
    const ok = isAutoConfirmable({
      status: order.status,
      deliveredAt: order.deliveredAt,
      hasOpenReturn: order.returnRequests.length > 0,
      now,
      days,
    });
    if (!ok) {
      skipped += 1;
      continue;
    }

    /**
     * 주문마다 따로 트랜잭션을 연다.
     *
     * 하나로 묶으면 한 건이 실패할 때 이미 처리한 것까지 되돌아간다.
     * 이 배치는 "할 수 있는 만큼 한다" 가 맞는 종류다 — 남은 것은 내일
     * 다시 잡힌다.
     */
    try {
      // 확정 한 번의 일(상태·줄·이력·적립)은 손님 확정과 같은 함수다
      const granted = await prisma.$transaction((tx) =>
        confirmDeliveredOrder(tx, order, { actor: 'system', note: `배송완료 ${days}일 경과로 자동 구매확정`, now }));

      if (granted === null) {
        skipped += 1;
        continue;
      }
      orderNos.push(order.orderNo);
      if (granted.granted) rewarded += granted.amount;
    } catch (error) {
      // 한 건 때문에 배치를 멈추지 않는다. 남은 것은 내일 다시 잡힌다.
      console.error('[auto-confirm] 실패', { orderNo: order.orderNo }, error);
      skipped += 1;
    }
  }

  return { confirmed: orderNos.length, rewarded, skipped, orderNos };
}
