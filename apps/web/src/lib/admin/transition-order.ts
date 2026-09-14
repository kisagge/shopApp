import 'server-only';
import { prisma } from '@shop/db';
import {
  adminStatusActions, canTransition, hasPermission, merchantScope, ORDER_STATUS_LABEL,
  orderStatusFromItems,
  type Actor, type OrderStatus,
} from '@shop/core';
import { grantPurchaseReward } from '~/lib/orders/grant-reward';
import { recordNotification } from '~/lib/notifications/record';

export class TransitionError extends Error {
  constructor(readonly code: string, message: string, readonly status = 409) {
    super(message);
    this.name = 'TransitionError';
  }
}

export interface TransitionResult {
  readonly orderNo: string;
  readonly orderStatus: OrderStatus;
  readonly itemsMoved: number;
  /** 다른 가맹점 줄이 남아 주문 전체는 아직 안 움직였는지 */
  readonly waitingForOthers: boolean;
  /** 구매확정으로 지급된 적립 포인트. 0이면 지급 없음 */
  readonly rewardGranted: number;
}

/** 어떤 전이에 어떤 권한이 필요한가 */
function permissionFor(to: OrderStatus) {
  if (to === 'CANCELLED') return 'order:cancel' as const;
  if (to === 'REFUNDED' || to === 'RETURNED') return 'order:refund' as const;
  return 'order:fulfill' as const;
}

/**
 * 어드민에서 주문 상태를 옮긴다.
 *
 * **한 주문에 여러 가맹점 상품이 섞인다.** 그래서 가맹점은 자기 줄(OrderItem)만
 * 옮기고, 주문 전체는 **모든 줄이 그 상태에 도달했을 때** 따라 움직인다.
 * 그러지 않으면 A 가맹점이 출고했다는 이유로 아직 준비 중인 B 가맹점 상품까지
 * 배송중으로 표시된다.
 *
 * 운영진은 주문 전체를 한 번에 옮긴다.
 */
export async function transitionOrder(
  orderNo: string,
  to: OrderStatus,
  actor: Actor,
  note?: string,
): Promise<TransitionResult> {
  /**
   * 환불은 여기서 할 수 없다.
   *
   * 이 함수는 상태를 옮길 뿐 돈을 움직이지 않는다. 예전에는 REFUNDED 도
   * 받아 줘서, 어드민이 환불완료로 바꿔도 **PG 취소가 나가지 않은 채**
   * 화면에만 환불됐다고 적혔다. 재고도 포인트도 그대로였다.
   *
   * 막아 두지 않으면 실수로든 새 코드로든 같은 우회가 다시 생긴다.
   * 환불은 refundOrder 하나로만 간다.
   */
  if (to === 'REFUNDED') {
    throw new TransitionError(
      'USE_REFUND',
      '환불은 상태 변경이 아니라 환불 처리로 진행해야 합니다.',
      400,
    );
  }

  /**
   * 취소도 여기서 할 수 없다 — 같은 이유로, 더 크게 샜다.
   *
   * 환불만 막아 두고 취소는 열어 뒀는데, 취소는 **주문 생성이 한 일을 전부
   * 역순으로 푸는 것**이다. 재고를 되돌리고, 쓴 포인트를 돌려주고, 쿠폰을
   * 되살리고, 돈이 잡혀 있으면 PG 취소를 보낸다. 여기로 오면 그중 아무것도
   * 일어나지 않는다 — 줄 상태만 취소로 바뀌고 재고는 영영 잠긴다.
   *
   * 취소는 cancelOrder 하나로만 간다.
   */
  if (to === 'CANCELLED') {
    throw new TransitionError(
      'USE_CANCEL',
      '취소는 상태 변경이 아니라 취소 처리로 진행해야 합니다.',
      400,
    );
  }

  const permission = permissionFor(to);
  if (!hasPermission(actor, permission)) {
    throw new TransitionError('FORBIDDEN', '이 동작을 수행할 권한이 없습니다.', 403);
  }

  const scope = merchantScope(actor);
  if (scope === undefined) {
    throw new TransitionError('FORBIDDEN', '조회 권한이 없습니다.', 403);
  }

  const order = await prisma.order.findFirst({
    where: { orderNo, ...(scope ? { items: { some: { merchantId: scope } } } : {}) },
    select: {
      id: true, orderNo: true, status: true,
      // 구매확정 적립에 필요하다
      userId: true, rewardPoints: true,
      items: { select: { id: true, status: true, merchantId: true, canceledAt: true } },
    },
  });
  if (!order) throw new TransitionError('ORDER_NOT_FOUND', '주문을 찾을 수 없습니다.', 404);

  /*
   * 출고 전에 취소된 줄은 옮기지 않는다. 넣으면 "취소 상태의 상품은 배송중으로 바꿀 수
   * 없습니다" 로 **남은 줄까지 못 보낸다.**
   */
  const live = order.items.filter((i) => !i.canceledAt);
  const mine = scope ? live.filter((i) => i.merchantId === scope) : live;
  if (mine.length === 0) {
    throw new TransitionError('NO_ITEMS', '처리할 상품이 없습니다.', 404);
  }

  // 상태머신이 허용하지 않는 전이는 여기서 막힌다.
  // 줄마다 상태가 다를 수 있으므로 전부 확인한다.
  for (const item of mine) {
    if (adminStatusActions(item.status).includes(to)) continue;

    /*
     * 표에는 있는데 이 문으로는 못 지나가는 길이 있다 — `adminStatusActions`
     * 주석 참고. 그런 것은 "바꿀 수 없습니다" 가 아니라 **어디로 가야 하는지**
     * 말해 줘야 한다.
     */
    if (canTransition(item.status, to)) {
      throw new TransitionError(
        'USE_RETURN_RESOLVE',
        '반품접수된 주문은 상태 변경이 아니라 반품 승인·반려로 진행해야 합니다.',
        400,
      );
    }
    throw new TransitionError(
      'INVALID_TRANSITION',
      `${ORDER_STATUS_LABEL[item.status]} 상태의 상품은 ${ORDER_STATUS_LABEL[to]}(으)로 바꿀 수 없습니다.`,
    );
  }

  let rewarded: { granted: boolean; amount: number } = { granted: false, amount: 0 };

  const result = await prisma.$transaction(async (tx) => {
    const { count } = await tx.orderItem.updateMany({
      where: { id: { in: mine.map((i) => i.id) }, status: { in: mine.map((i) => i.status) } },
      data: { status: to },
    });
    if (count === 0) {
      throw new TransitionError('ALREADY_PROCESSED', '이미 처리된 주문입니다.');
    }

    /**
     * 주문 전체의 상태는 **가장 뒤처진 줄**이 정한다. 취소·반품처럼 갈래로
     * 빠진 상태는 **모든 줄이 그 갈래에 도달했을 때** 주문이 따라간다.
     *
     * 상태머신은 **줄(OrderItem)의 전이**를 지킨다. 그게 실제 업무 사건이기
     * 때문이다. 반면 주문의 상태는 줄들을 요약한 **파생값**이라, 여기에 단일 홉
     * 전이 규칙을 다시 강요하면 안 된다.
     *
     * 세 번 틀렸다.
     * 1) "모든 줄이 목표 상태와 같은가" 로 봤더니, 한 가맹점이 먼저 출고한
     *    순간 주문이 영영 안 움직였다.
     * 2) 고친 뒤에도 canTransition(order.status, derived) 를 걸어 뒀더니,
     *    두 줄이 모두 배송중인데 주문은 결제완료에 머물렀다 —
     *    PAID → SHIPPED 는 한 홉에 갈 수 없기 때문이다.
     * 3) 이행 경로만 묻고 있어서 **반품완료로는 아예 못 갔다** —
     *    `orderStatusFromItems` 주석에 자세히 적었다.
     */
    const all = await tx.orderItem.findMany({
      where: { orderId: order.id },
      select: { status: true },
    });
    const derived = orderStatusFromItems(all.map((i) => i.status));
    const moveOrder = derived !== null && derived !== order.status;

    if (moveOrder) {
      const timestamps: Record<string, Date> = {};
      if (derived === 'SHIPPED') timestamps['shippedAt'] = new Date();
      if (derived === 'DELIVERED') timestamps['deliveredAt'] = new Date();
      if (derived === 'CONFIRMED') timestamps['confirmedAt'] = new Date();

      /**
       * 조건부 UPDATE 로 옮긴다.
       *
       * 그냥 update 하면 같은 순간 다른 요청이 먼저 확정시켰어도 성공한
       * 것처럼 보이고, 그 아래 적립이 **두 번** 나간다. 포인트는 돈이고
       * 한 번 더 준 것은 회수할 수 없다.
       */
      const { count: moved } = await tx.order.updateMany({
        where: { id: order.id, status: order.status },
        data: { status: derived, ...timestamps },
      });
      if (moved === 0) throw new TransitionError('ALREADY_PROCESSED', '이미 처리된 주문입니다.');

      await tx.orderStatusLog.create({
        data: {
          orderId: order.id, from: order.status, to: derived,
          actor: actor.id, note: note ?? '어드민에서 변경',
        },
      });

      // 구매확정 적립. 여기까지 왔다는 것은 이 요청이 확정을 만들었다는 뜻이다.
      if (derived === 'CONFIRMED') {
        rewarded = await grantPurchaseReward(tx, {
          id: order.id, orderNo: order.orderNo,
          userId: order.userId, rewardPoints: order.rewardPoints,
        });
      }
    } else {
      // 주문은 아직 안 움직였어도 누가 무엇을 했는지는 남긴다
      await tx.orderStatusLog.create({
        data: {
          orderId: order.id, from: order.status, to: order.status,
          actor: actor.id,
          note: `${ORDER_STATUS_LABEL[to]} 처리 (${count}개 상품) — 다른 가맹점 상품 대기 중`,
        },
      });
    }

    return { moveOrder, count, derived };
  });

  /*
   * 알림은 트랜잭션 **밖에서** 남긴다. 안에 넣으면 알림을 못 남겼다고 주문
   * 상태 변경까지 되돌아가는데, 그건 사람이 한 처리를 알림 하나 때문에
   * 무르는 셈이다.
   */
  if (result.moveOrder && (result.derived === 'SHIPPED' || result.derived === 'DELIVERED')) {
    await recordNotification({
      userId: order.userId,
      kind: result.derived === 'SHIPPED' ? 'ORDER_SHIPPED' : 'ORDER_DELIVERED',
      params: { orderNo: order.orderNo },
      linkPath: `/order/${order.orderNo}`,
    });
  }

  return {
    orderNo: order.orderNo,
    orderStatus: result.moveOrder && result.derived ? result.derived : order.status,
    itemsMoved: result.count,
    waitingForOthers: !result.moveOrder,
    rewardGranted: rewarded.granted ? rewarded.amount : 0,
  };
}
