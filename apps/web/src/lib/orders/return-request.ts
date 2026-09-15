import 'server-only';
import { prisma } from '@shop/db';
import {
  checkReturnEligibility, shippingBorneBy, transition, isReturnableLine, hasPermission, canResolveReturnOf,
  checkExchangeOption, EXCHANGE_OPTION_MESSAGE,
  RETURN_REASON_LABEL, RETURN_TYPE_LABEL,
  type Actor, type ReturnReason, type ReturnType,
  statusBeforeReturn,
} from '@shop/core';

/**
 * 반품·교환 신청과 처리.
 *
 * 신청은 고객이, 처리는 운영진이 한다.
 *
 * **반송비 부담은 요청으로 받지 않고 사유에서 정한다.** 받아 쓰면 누구나
 * "판매자 부담" 을 보내 반송비를 넘길 수 있다.
 *
 * 교환은 상태머신에 따로 두지 않았다. 상태로 보면 반품과 같은 자리(회수)를 지나고, 끝이 다를 뿐이다 —
 * 반품은 돈을 돌려주고(complete-return), 교환은 바꾼 옵션을 보낸다(complete-exchange). 신청할 때 바꿀 옵션을
 * 받아 그 재고를 잡아 둔다.
 */

export class ReturnError extends Error {
  constructor(readonly code: string, message: string, readonly status = 409) {
    super(message);
    this.name = 'ReturnError';
  }
}

export interface ReturnRequestResult {
  readonly orderNo: string;
  readonly type: ReturnType;
  readonly reason: ReturnReason;
  readonly shippingBorneBy: string;
  readonly orderStatus: string;
  readonly itemIds: readonly string[];
}

export async function requestReturn(
  orderNo: string,
  input: {
    type: ReturnType;
    reason: ReturnReason;
    detail?: string | undefined;
    /** 돌려보낼 줄. 비우면 받은 줄 전부 */
    itemIds?: readonly string[] | undefined;
    /** 교환 — 줄마다 대신 받을 옵션 */
    exchanges?: readonly { itemId: string; variantId: string }[] | undefined;
  },
  user: { id: string },
  now: Date = new Date(),
): Promise<ReturnRequestResult> {
  // 남의 주문에 신청할 수 없다. userId 를 조회에 함께 건다.
  const order = await prisma.order.findFirst({
    where: { orderNo, userId: user.id },
    select: {
      id: true, orderNo: true, status: true, deliveredAt: true,
      items: {
        select: {
          id: true, status: true, canceledAt: true, quantity: true, optionLabel: true,
          variant: { select: { id: true, productId: true, priceOverride: true } },
        },
      },
    },
  });
  if (!order) throw new ReturnError('ORDER_NOT_FOUND', '주문을 찾을 수 없습니다.', 404);

  const eligibility = checkReturnEligibility({
    status: order.status,
    deliveredAt: order.deliveredAt,
    reason: input.reason,
    now,
  });
  if (!eligibility.ok) {
    throw new ReturnError(eligibility.code, eligibility.message);
  }

  /*
   * **고른 줄만 반품접수로 옮긴다.** 나머지 줄은 받은 그대로다 — 반품이 끝나면 주문은 그
   * 줄들의 상태로 돌아간다. 이미 돈이 돌아간 줄(취소·환불)은 고를 수 없다.
   */
  const returnable = order.items.filter(isReturnableLine);
  const wanted = input.itemIds && input.itemIds.length > 0 ? [...new Set(input.itemIds)] : null;
  if (wanted) {
    const known = new Set(returnable.map((i) => i.id));
    if (wanted.some((id) => !known.has(id))) {
      throw new ReturnError('ITEM_NOT_RETURNABLE', '돌려보낼 수 없는 상품이 섞여 있습니다.', 400);
    }
  }
  const chosen = wanted ?? returnable.map((i) => i.id);
  if (chosen.length === 0) {
    throw new ReturnError('NO_ITEMS', '돌려보낼 상품이 없습니다.', 400);
  }

  /*
   * **교환이면 돌려보내는 줄마다 바꿀 옵션이 하나씩.** 빠진 줄이 있으면 그 줄은 무엇으로 바꿀지 모르고, 신청하지 않은
   * 줄에 옵션을 붙이면 받지도 않은 물건을 보내게 된다. 옵션은 같은 상품·같은 추가금·재고 있음(core)이어야 한다.
   */
  const exchangePlan =
    input.type === 'EXCHANGE' ? await planExchange(order.items, chosen, input.exchanges ?? []) : [];

  const borneBy = shippingBorneBy(input.reason);
  const nextStatus = transition(order.status, 'RETURN_REQUESTED');

  await prisma.$transaction(async (tx) => {
    // 조건부 UPDATE. 그 사이 상태가 바뀌었으면 0건이 나온다.
    const { count } = await tx.order.updateMany({
      where: { id: order.id, status: order.status },
      data: { status: nextStatus },
    });
    if (count === 0) throw new ReturnError('ALREADY_PROCESSED', '이미 처리된 주문입니다.');

    await tx.orderItem.updateMany({
      // 고른 줄만. 취소된 줄은 반품할 물건이 아니다
      where: { orderId: order.id, canceledAt: null, id: { in: chosen } },
      data: { status: nextStatus },
    });

    /*
     * 바꿀 옵션의 재고를 **지금 잡는다** — 승인·회수를 기다리는 사이 팔려 나가면 보낼 물건이 없다. 조건부로 깎아
     * 그 사이 누가 사 갔으면 여기서 멈춘다(주문 생성과 같은 방식).
     */
    for (const line of exchangePlan) {
      const { count: reserved } = await tx.productVariant.updateMany({
        where: { id: line.toVariantId, isActive: true, stock: { gte: line.quantity } },
        data: { stock: { decrement: line.quantity } },
      });
      if (reserved === 0) {
        throw new ReturnError('OUT_OF_STOCK', `${line.toOptionLabel} — ${EXCHANGE_OPTION_MESSAGE.OUT_OF_STOCK}`);
      }
    }

    await tx.returnRequest.create({
      data: {
        orderId: order.id,
        type: input.type,
        reason: input.reason,
        ...(input.detail ? { detail: input.detail } : {}),
        shippingBorneBy: borneBy,
        itemIds: chosen,
        ...(exchangePlan.length > 0 ? { exchangeLines: { create: exchangePlan } } : {}),
      },
    });

    await tx.orderStatusLog.create({
      data: {
        orderId: order.id,
        from: order.status,
        to: nextStatus,
        actor: user.id,
        note: `${RETURN_TYPE_LABEL[input.type]} 신청 ${chosen.length}건 — ${RETURN_REASON_LABEL[input.reason]}`,
      },
    });
  });

  return {
    orderNo: order.orderNo,
    type: input.type,
    reason: input.reason,
    shippingBorneBy: borneBy,
    orderStatus: nextStatus,
    itemIds: chosen,
  };
}

interface ExchangeLinePlan {
  readonly orderItemId: string;
  readonly fromVariantId: string;
  readonly fromOptionLabel: string;
  readonly toVariantId: string;
  readonly toOptionLabel: string;
  readonly quantity: number;
}

async function planExchange(
  items: readonly {
    id: string; quantity: number; optionLabel: string;
    variant: { id: string; productId: string; priceOverride: number | null };
  }[],
  chosen: readonly string[],
  exchanges: readonly { itemId: string; variantId: string }[],
): Promise<ExchangeLinePlan[]> {
  const byItem = new Map(exchanges.map((e) => [e.itemId, e.variantId]));
  if (byItem.size !== exchanges.length || exchanges.some((e) => !chosen.includes(e.itemId)) || chosen.some((id) => !byItem.has(id))) {
    throw new ReturnError('EXCHANGE_MISMATCH', '교환할 상품마다 바꿀 옵션을 하나씩 골라 주세요.', 400);
  }

  const candidates = await prisma.productVariant.findMany({
    where: { id: { in: [...byItem.values()] } },
    select: { id: true, productId: true, priceOverride: true, stock: true, isActive: true, label: true },
  });

  return chosen.map((itemId) => {
    const item = items.find((i) => i.id === itemId)!;
    const candidate = candidates.find((c) => c.id === byItem.get(itemId));
    if (!candidate) throw new ReturnError('EXCHANGE_OPTION_NOT_FOUND', '바꿀 옵션을 찾을 수 없습니다.', 400);
    const check = checkExchangeOption(
      { productId: item.variant.productId, variantId: item.variant.id, priceOverride: item.variant.priceOverride, quantity: item.quantity },
      { productId: candidate.productId, variantId: candidate.id, priceOverride: candidate.priceOverride, stock: candidate.stock, isActive: candidate.isActive },
    );
    if (!check.ok) throw new ReturnError(check.code, `${candidate.label} — ${EXCHANGE_OPTION_MESSAGE[check.code]}`, 400);
    return {
      orderItemId: item.id,
      fromVariantId: item.variant.id,
      fromOptionLabel: item.optionLabel,
      toVariantId: candidate.id,
      toOptionLabel: candidate.label,
      quantity: item.quantity,
    };
  });
}

/**
 * 처리할 신청을 읽고 **처리해도 되는 사람인지** 본다.
 *
 * 가맹점도 처리한다(`return:resolve`) — 반품된 물건을 받는 곳이 가맹점 창고다. 다만 신청한 줄이
 * 전부 자기 상품일 때만이다(`canResolveReturnOf`). 섞였으면 운영진 몫이라고 **이유를 말해**
 * 거절한다. 남의 주문인지 아닌지를 새지 않게, 자기 상품이 하나도 없는 주문은 없는 주문으로 답한다.
 */
export async function loadForResolve(orderNo: string, actor: Actor) {
  if (!hasPermission(actor, 'return:resolve')) {
    throw new ReturnError('FORBIDDEN', '이 동작을 수행할 권한이 없습니다.', 403);
  }

  const order = await prisma.order.findFirst({
    where: { orderNo },
    select: {
      id: true, orderNo: true, status: true, userId: true,
      // 반려하면 왔던 자리로 되돌린다. 그 자리를 이 두 시각으로 되짚는다.
      confirmedAt: true, deliveredAt: true,
      items: { select: { id: true, status: true, canceledAt: true, merchantId: true } },
      returnRequests: {
        orderBy: { requestedAt: 'desc' },
        take: 1,
        select: {
          id: true, type: true, status: true, itemIds: true, receivedAt: true,
          exchangeLines: {
            select: { orderItemId: true, fromVariantId: true, fromOptionLabel: true, toVariantId: true, toOptionLabel: true, quantity: true },
          },
        },
      },
    },
  });
  const mine = actor.merchantId ? order?.items.some((i) => i.merchantId === actor.merchantId) : true;
  if (!order || !mine) throw new ReturnError('ORDER_NOT_FOUND', '주문을 찾을 수 없습니다.', 404);

  const request = order.returnRequests[0];
  if (!request) throw new ReturnError('NO_REQUEST', '반품 신청이 없습니다.', 404);

  // 옛 신청(줄 없음)은 반품접수인 줄 전부다
  const lines = order.items.filter((i) =>
    request.itemIds.length > 0 ? request.itemIds.includes(i.id) : i.status === 'RETURN_REQUESTED' && !i.canceledAt);
  if (!canResolveReturnOf(actor, lines.map((l) => l.merchantId))) {
    throw new ReturnError(
      'MIXED_MERCHANTS',
      '다른 가맹점 상품이 함께 신청된 반품입니다. 운영진이 처리합니다.',
      403,
    );
  }
  return { order, request };
}

/**
 * 돌려보낸 물건이 도착했다고 확인한다. **돈은 움직이지 않는다.**
 *
 * 승인한 신청에만, 한 번만. 운영진은 이 표시를 보고 환불한다.
 */
export async function receiveReturn(
  orderNo: string,
  actor: Actor,
  now: Date = new Date(),
): Promise<{ orderNo: string; receivedAt: Date }> {
  const { order, request } = await loadForResolve(orderNo, actor);
  if (request.status !== 'APPROVED') {
    throw new ReturnError('NOT_APPROVED', '승인한 신청만 회수를 확인할 수 있습니다.');
  }
  if (request.receivedAt) {
    throw new ReturnError('ALREADY_RECEIVED', '이미 회수를 확인한 신청입니다.');
  }

  await prisma.$transaction(async (tx) => {
    // 조건부 UPDATE — 두 사람이 동시에 눌러도 한 번만 찍힌다
    const { count } = await tx.returnRequest.updateMany({
      where: { id: request.id, status: 'APPROVED', receivedAt: null },
      data: { receivedAt: now, receivedBy: actor.id },
    });
    if (count === 0) throw new ReturnError('ALREADY_RECEIVED', '이미 회수를 확인한 신청입니다.');
    await tx.orderStatusLog.create({
      data: {
        orderId: order.id, from: order.status, to: order.status, actor: actor.id,
        note: actor.merchantId ? '반품 회수 확인 (가맹점)' : '반품 회수 확인',
      },
    });
  });

  return { orderNo: order.orderNo, receivedAt: now };
}

/**
 * 신청을 처리한다(승인·반려). 가맹점도 자기 상품 신청이면 한다.
 *
 * 승인하면 회수를 기다리는 상태가 되고, 실제 회수·환불은 기존 반품완료·
 * 환불 흐름을 그대로 탄다. **여기서 돈을 움직이지 않는다** — 환불은
 * order:refund 권한이 따로 있는 동작이다.
 *
 * 반려하면 주문을 신청 전 상태로 되돌린다. 되돌리지 않으면 주문이 반품접수에
 * 갇혀서 고객도 운영도 아무것도 못 한다.
 */
export async function resolveReturn(
  orderNo: string,
  input: { action: 'APPROVE' | 'REJECT'; rejectReason?: string | undefined },
  actor: Actor,
): Promise<{ orderNo: string; status: string; orderStatus: string }> {
  const { order, request } = await loadForResolve(orderNo, actor);
  if (request.status !== 'REQUESTED') {
    throw new ReturnError('ALREADY_RESOLVED', '이미 처리된 신청입니다.');
  }

  const approve = input.action === 'APPROVE';

  /**
   * 반려하면 **왔던 자리로** 되돌린다.
   *
   * 예전에는 무조건 배송중이었다. 반품이 배송중·배송완료에서만 올 수 있어서
   * 그래도 됐는데, 구매확정에서도 올 수 있게 되면서 깨졌다 — 확정된 주문이
   * 배송중으로 되돌아가면 사람에게는 이미 받은 물건이 "배송중" 으로 보이고,
   * 다시 확정될 때 `confirmedAt` 이 덮여 **이미 지급한 달의 매출이 다른 달로
   * 옮겨간다.**
   *
   * 시각은 다시 쓰지 않는다. 상태만 되돌린다.
   */
  const nextOrderStatus = approve
    ? order.status
    : transition(order.status, statusBeforeReturn(order));

  await prisma.$transaction(async (tx) => {
    await tx.returnRequest.update({
      where: { id: request.id },
      data: {
        status: approve ? 'APPROVED' : 'REJECTED',
        ...(approve ? {} : { rejectReason: input.rejectReason ?? null }),
        resolvedAt: new Date(),
        resolvedBy: actor.id,
      },
    });

    if (approve) return;

    // 교환을 반려하면 잡아 둔 옵션 재고를 풀어 준다 — 안 풀면 아무도 안 받을 물건이 품절로 보인다
    for (const line of request.exchangeLines) {
      await tx.productVariant.updateMany({
        where: { id: line.toVariantId },
        data: { stock: { increment: line.quantity } },
      });
    }

    await tx.order.updateMany({
      where: { id: order.id, status: order.status },
      data: { status: nextOrderStatus },
    });
    await tx.orderItem.updateMany({
      /*
       * 신청한 줄만 되돌린다. 옛 신청(줄을 안 고른)은 반품접수인 줄 전부다 — 줄을 고르게
       * 되기 전에는 그게 곧 신청한 줄이었다.
       */
      where: {
        orderId: order.id,
        canceledAt: null,
        ...(request.itemIds.length > 0 ? { id: { in: request.itemIds } } : { status: 'RETURN_REQUESTED' }),
      },
      data: { status: nextOrderStatus },
    });
    await tx.orderStatusLog.create({
      data: {
        orderId: order.id,
        from: order.status,
        to: nextOrderStatus,
        actor: actor.id,
        note: `${request.type === 'EXCHANGE' ? '교환' : '반품'} 반려 — ${input.rejectReason ?? ''}`,
      },
    });
  });

  return {
    orderNo: order.orderNo,
    status: approve ? 'APPROVED' : 'REJECTED',
    orderStatus: approve ? order.status : nextOrderStatus,
  };
}
