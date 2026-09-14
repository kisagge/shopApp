import 'server-only';
import { prisma } from '@shop/db';
import {
  hasPermission, merchantScope, isCarrierCode, normalizeTrackingNumber,
  isTrackingNumberLike, carrierOf, canRegisterShipment, ORDER_STATUS_LABEL,
  type Actor,
} from '@shop/core';
import { transitionOrder, TransitionError } from './transition-order';
import { recordAudit } from '~/lib/audit';

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
    select: { id: true, orderNo: true, status: true },
  });
  if (!order) throw new ShipmentError('ORDER_NOT_FOUND', '주문을 찾을 수 없습니다.', 404);

  /*
   * **상태를 저장 전에 본다.**
   *
   * 예전에는 송장을 먼저 쓰고 전이를 시도한 뒤, 전이가 실패하면 그 오류를
   * 삼켰다. 삼키는 것 자체는 뜻이 있었다 — 이미 배송 중인 주문의 오타를
   * 고치러 온 사람을 막으면 안 된다. 그런데 그 예외가 **모든 실패한 전이**에
   * 걸려서, 취소·환불된 주문에도 송장이 붙었다. 고객 화면은 송장이 있으면
   * 운송 조회를 그리므로, 취소한 주문에 배송 조회가 떴다.
   *
   * 결제완료도 잘못 열려 있었다. 거기서 배송중으로 가는 길은 없는데(배송준비를
   * 거쳐야 한다) 누르면 송장만 쓰이고 상태는 그대로였다 — 단추 이름이
   * 거짓말을 했다.
   */
  if (!canRegisterShipment(order.status)) {
    throw new ShipmentError(
      'NOT_SHIPPABLE',
      `${ORDER_STATUS_LABEL[order.status]} 주문에는 송장을 등록할 수 없습니다.`,
    );
  }

  await prisma.shipment.upsert({
    where: { orderId: order.id },
    /*
     * 다시 등록하면 덮어쓴다. 송장을 잘못 넣는 일은 흔하고, 고칠 방법이
     * 없으면 고객은 남의 택배를 조회하게 된다.
     *
     * **보낸 날짜는 그대로 둔다.** 오타를 고치는 것이지 다시 보내는 것이
     * 아닌데, 예전에는 고칠 때마다 오늘로 덮여서 지난주에 보낸 주문의 발송일이
     * 오늘이 됐다.
     */
    update: { carrier: input.carrier, trackingNumber },
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
     *
     * **여기까지 오는 상태는 위에서 이미 걸러졌다.** 예전에는 이 삼킴이
     * 모든 실패한 전이에 걸려서, 취소된 주문에 송장이 붙고도 조용했다.
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

/**
 * 송장 등록 + 감사 로그.
 *
 * **한 건 등록과 일괄 등록이 이것 하나를 쓴다.** 감사 로그를 라우트에서 남기면
 * 일괄 창구를 새로 만들 때 그 줄을 옮겨 적어야 하고, 빠뜨리면 **수백 건의 송장이
 * 누가 넣었는지 모르게** 들어간다. 송장은 손님에게 나가는 정보이고, 잘못 넣으면
 * 남의 택배를 조회하게 된다.
 */
export async function registerShipmentAudited(
  orderNo: string,
  input: ShipmentInput,
  actor: Actor,
  request: Request,
): Promise<ShipmentResult> {
  const result = await registerShipment(orderNo, input, actor);
  await recordAudit({
    actor,
    action: 'order.ship',
    targetType: 'order',
    targetId: result.orderNo,
    after: { carrier: result.carrier, trackingNumber: result.trackingNumber },
    request,
  });
  return result;
}

/**
 * 이미 **같은 송장**이 붙어 있는 주문번호.
 *
 * 일괄 올리기의 자연스러운 사용법은 "내려받은 파일을 채워 통째로 올리기" 다. 그 파일에는
 * 지난번에 올린 주문도 송장이 찬 채로 들어 있다. 그걸 다시 등록하면 값은 그대로인데
 * **수백 줄의 감사 로그가 "송장 등록" 으로 쌓이고**, 결과는 "300건 등록" 이라고 거짓말을
 * 한다 — 운영자는 이번에 몇 건을 새로 보냈는지 알 수 없다. e2e 가 이렇게 잡았다.
 *
 * 가맹점 범위를 건다. 걸지 않으면 남의 주문번호를 넣어 보는 것으로 "같다/다르다" 가
 * 새어 나간다 — 범위 밖 주문은 여기서 빠지고, 등록 단계에서 "주문을 찾을 수 없습니다" 가 된다.
 */
export async function findUnchangedShipments(
  entries: readonly { orderNo: string; carrier: string; trackingNumber: string }[],
  actor: Actor,
): Promise<Set<string>> {
  const scope = merchantScope(actor);
  if (scope === undefined || entries.length === 0) return new Set();

  const orders = await prisma.order.findMany({
    where: {
      orderNo: { in: entries.map((e) => e.orderNo) },
      ...(scope ? { items: { some: { merchantId: scope } } } : {}),
    },
    select: { orderNo: true, shipment: { select: { carrier: true, trackingNumber: true } } },
  });
  const current = new Map(orders.map((o) => [o.orderNo, o.shipment]));

  return new Set(
    entries
      .filter((e) => {
        const shipment = current.get(e.orderNo);
        return (
          shipment != null &&
          shipment.carrier === e.carrier &&
          shipment.trackingNumber === normalizeTrackingNumber(e.trackingNumber)
        );
      })
      .map((e) => e.orderNo),
  );
}
