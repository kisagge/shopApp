import 'server-only';
import { prisma } from '@shop/db';
import { isAbandonedHold, paymentHoldCutoff, PAYMENT_HOLD_MINUTES } from '@shop/core';
import { CRON_ACTOR } from '~/lib/cron';
import { cancelOrder } from './cancel-order';

/**
 * 결제하지 않고 떠난 주문의 재고를 푼다.
 *
 * **되돌리는 일을 여기서 다시 쓰지 않는다.** 재고·포인트·쿠폰을 푸는 순서는
 * 이미 cancelOrder 가 알고 있고, 두 벌로 두면 한쪽만 고쳐진다 — 그 어긋남은
 * "취소했는데 포인트가 안 돌아왔다" 로 나타난다.
 *
 * 여러 번 돌아도 안전하다. cancelOrder 가 조건부 UPDATE 로 상태를 바꾸므로
 * 그 사이에 사용자가 결제했거나 스스로 취소했으면 0건이 되어 건너뛴다.
 */

export interface ReleaseResult {
  readonly released: number;
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

export async function releaseAbandonedHolds(
  now = new Date(),
  options: { minutes?: number; limit?: number; variantIds?: readonly string[] } = {},
): Promise<ReleaseResult> {
  const minutes = options.minutes ?? PAYMENT_HOLD_MINUTES;

  const candidates = await prisma.order.findMany({
    where: {
      status: 'PENDING',
      placedAt: { lt: paymentHoldCutoff(now, minutes) },
      /*
       * **특정 변형만 풀 수도 있다.**
       *
       * 배치는 밀린 것을 순서대로 처리하지만, 주문을 만들다 품절에 막힌
       * 자리에서는 **지금 사려는 그 변형**만 풀면 된다. 남의 주문까지
       * 건드리면 사는 사람이 기다리는 시간에 관계없는 일이 붙는다.
       */
      ...(options.variantIds === undefined
        ? {}
        : { items: { some: { variantId: { in: [...options.variantIds] } } } }),
    },
    orderBy: { placedAt: 'asc' },
    take: options.limit ?? MAX_PER_RUN,
    select: {
      orderNo: true,
      status: true,
      placedAt: true,
      payment: { select: { status: true, pgPaymentKey: true } },
    },
  });

  const orderNos: string[] = [];
  let skipped = 0;

  for (const order of candidates) {
    /*
     * 조회로 한 번 좁히고 정책으로 한 번 더 본다. 같은 조건을 SQL 로만
     * 쓰면 "왜 이건 안 풀렸나" 를 코드에서 읽을 수 없고, 규칙이 조회문
     * 안에 숨는다.
     */
    const releasable = isAbandonedHold(
      {
        status: order.status,
        placedAt: order.placedAt,
        paymentStatus: order.payment?.status ?? null,
        hasPaymentKey: Boolean(order.payment?.pgPaymentKey),
      },
      now,
      minutes,
    );
    if (!releasable) {
      skipped += 1;
      continue;
    }

    try {
      await cancelOrder(order.orderNo, CRON_ACTOR, '결제 대기 시간이 지나 자동 취소되었습니다');
      orderNos.push(order.orderNo);
    } catch (error) {
      /*
       * 하나가 실패해도 나머지는 푼다. 여기서 던지면 뒤에 밀린 주문의
       * 재고가 다음 실행까지 그대로 묶인다.
       */
      skipped += 1;
      console.error('[orders] 결제 대기 주문을 풀지 못했습니다', {
        orderNo: order.orderNo,
        error,
      });
    }
  }

  return { released: orderNos.length, skipped, orderNos };
}
