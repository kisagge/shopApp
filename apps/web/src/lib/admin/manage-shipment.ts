import 'server-only';
import { prisma } from '@shop/db';
import {
  hasPermission, merchantScope, isCarrierCode, normalizeTrackingNumber,
  isTrackingNumberLike, carrierOf,
  type Actor,
} from '@shop/core';
import { transitionOrder, TransitionError } from './transition-order';

/**
 * 송장 등록.
 *
 * **송장을 넣는 것과 배송중으로 옮기는 것은 한 동작이다.**
 * 나눠 두면 송장 없이 배송중이 된 주문이 생기고, 고객은 "배송중" 이라는
 * 글자만 보면서 어디쯤인지 물어볼 곳이 없다. 실제로 가장 많이 들어오는
 * 문의가 그것이다.
 *
 * 반대 순서도 막는다 — 송장만 넣고 상태를 안 옮기면 고객 화면에 아무것도
 * 안 나타난다. 한 트랜잭션으로 묶지 않고 순서를 정한 이유는 상태 전이가
 * 이미 자기 규칙(가맹점별 줄 처리, 상태머신)을 갖고 있어서다. 송장을 먼저
 * 저장하고 그다음 전이한다 — 전이가 실패하면 송장만 남는데, 그건 화면에
 * 안 보일 뿐 잘못된 상태가 아니다.
 */

export class ShipmentError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) {
    super(message);
    this.name = 'ShipmentError';
  }
}

export interface ShipmentInput {
  readonly carrier: string;
  readonly trackingNumber: string;
}

export interface ShipmentResult {
  readonly orderNo: string;
  readonly carrier: string;
  readonly trackingNumber: string;
  readonly orderStatus: string;
  readonly waitingForOthers: boolean;
}

export async function registerShipment(
  orderNo: string,
  input: ShipmentInput,
  actor: Actor,
): Promise<ShipmentResult> {
  if (!hasPermission(actor, 'order:fulfill')) {
    throw new ShipmentError('FORBIDDEN', '이 동작을 수행할 권한이 없습니다.', 403);
  }
  if (!isCarrierCode(input.carrier)) {
    throw new ShipmentError('INVALID_CARRIER', '택배사를 선택해 주세요.');
  }

  const trackingNumber = normalizeTrackingNumber(input.trackingNumber);
  if (!isTrackingNumberLike(trackingNumber)) {
    throw new ShipmentError('INVALID_TRACKING_NUMBER', '송장번호를 확인해 주세요.');
  }

  const scope = merchantScope(actor);
  if (scope === undefined) throw new ShipmentError('FORBIDDEN', '조회 권한이 없습니다.', 403);

  // 남의 가맹점 주문에 송장을 붙일 수 없다. 조회에 scope 를 함께 건다.
  const order = await prisma.order.findFirst({
    where: { orderNo, ...(scope ? { items: { some: { merchantId: scope } } } : {}) },
    select: { id: true, orderNo: true },
  });
  if (!order) throw new ShipmentError('ORDER_NOT_FOUND', '주문을 찾을 수 없습니다.', 404);

  await prisma.shipment.upsert({
    where: { orderId: order.id },
    // 다시 등록하면 덮어쓴다. 송장을 잘못 넣는 일은 흔하고, 고칠 방법이
    // 없으면 고객은 남의 택배를 조회하게 된다.
    update: { carrier: input.carrier, trackingNumber, shippedAt: new Date() },
    create: {
      orderId: order.id,
      carrier: input.carrier,
      trackingNumber,
      shippedAt: new Date(),
    },
  });

  const carrierName = carrierOf(input.carrier)?.name ?? input.carrier;

  try {
    const moved = await transitionOrder(
      orderNo,
      'SHIPPED',
      actor,
      `송장 등록 (${carrierName} ${trackingNumber})`,
    );
    return {
      orderNo: order.orderNo,
      carrier: input.carrier,
      trackingNumber,
      orderStatus: moved.orderStatus,
      waitingForOthers: moved.waitingForOthers,
    };
  } catch (error) {
    /**
     * 이미 배송중인 주문에 송장만 고치는 경우다. 전이는 실패하지만
     * 송장은 바뀌어야 한다 — 오타를 고치러 온 사람을 막으면 안 된다.
     */
    if (error instanceof TransitionError && error.code === 'INVALID_TRANSITION') {
      const current = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
        select: { status: true },
      });
      return {
        orderNo: order.orderNo,
        carrier: input.carrier,
        trackingNumber,
        orderStatus: current.status,
        waitingForOthers: false,
      };
    }
    throw error;
  }
}
