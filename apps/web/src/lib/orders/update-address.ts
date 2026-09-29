import 'server-only';
import { prisma } from '@shop/db';
import {
  checkAddressEdit, isRemoteAreaPostalCode, normalizePhone, remoteSurchargeDelta,
  isPaidStatus, awaitingDeposit,
  type AddressEditBlock,
} from '@shop/core';
import type { updateOrderAddressSchema } from '@shop/contract';
import type { z } from 'zod';
import { getShippingPolicy } from '~/lib/shipping-policy';

type UpdateOrderAddressInput = z.infer<typeof updateOrderAddressSchema>;

/**
 * 주문의 배송지를 고친다.
 *
 * **아무도 못 고쳤다.** 손님도 운영자도 창구가 없어서, 상세주소를 잘못 적거나 받는 사람을 바꾸고 싶으면
 * 출고 전이라도 방법이 없었다 — 취소하고 다시 사거나(쿠폰·적립금이 다시 계산되고 재고가 잠깐 풀린다)
 * 1:1 문의로 부탁해야 했고, 운영자도 화면에서 할 수 없어 결국 DB 를 직접 만졌다.
 *
 * **도서산간 여부가 바뀌면 배송비가 따라 움직인다.** 다만 돈이 굳기 전까지만이다 — 그 뒤의 차액은
 * 추가 결제나 부분 환불이라 새 경로를 열어야 한다. 그 판단은 core 가 한다(checkAddressEdit).
 */

type AddressEditErrorCode = AddressEditBlock | 'ORDER_NOT_FOUND' | 'FORBIDDEN';

export class AddressEditError extends Error {
  constructor(readonly code: AddressEditErrorCode, readonly status = 409) {
    super(MESSAGE[code]);
    this.name = 'AddressEditError';
  }
}

/** 문구 자리에 사전 열쇠를 적는다 — 번역은 응답을 만드는 서버가 한다(api/respond) */
const MESSAGE: Readonly<Record<AddressEditErrorCode, string>> = {
  ORDER_NOT_FOUND: 'err.order.notFound',
  FORBIDDEN: 'api.forbidden',
  ALREADY_SHIPPED: 'err.addressEdit.alreadyShipped',
  ORDER_CLOSED: 'err.addressEdit.orderClosed',
  ZONE_CHANGE_AFTER_PAYMENT: 'err.addressEdit.zoneAfterPayment',
  ZONE_CHANGE_ON_DEPOSIT: 'err.addressEdit.zoneOnDeposit',
};

/** 감사 로그에 남길 배송지 한 벌 */
export interface AddressSnapshot {
  readonly recipient: string;
  readonly phone: string;
  readonly postalCode: string;
  readonly address1: string;
  readonly address2: string | null;
  readonly memo: string | null;
  readonly isRemoteArea: boolean;
}

export interface AddressEditResult {
  readonly orderNo: string;
  /** 달라진 배송비. 0 이면 금액은 그대로다 */
  readonly shippingDelta: number;
  readonly shippingFee: number;
  readonly payable: number;
  readonly isRemoteArea: boolean;
  /** 무엇을 무엇으로 바꿨는가 — 운영자가 고쳤을 때 감사 로그가 이 둘을 남긴다 */
  readonly before: AddressSnapshot;
  readonly after: AddressSnapshot;
}

export async function updateOrderAddress(
  orderNo: string,
  input: UpdateOrderAddressInput,
  /**
   * 누가 고치는가.
   *
   * 손님이 부르면 `userId` 로 자기 것만 고치게 묶는다 — 주문번호만으로 고칠 수 있으면 남의 주소를 바꿀 수
   * 있다. 가맹점이 부르면 `merchantId` 로 자기 상품이 담긴 주문만 연다. 운영진은 둘 다 없이 부른다.
   */
  by: { readonly userId?: string; readonly merchantId?: string },
): Promise<AddressEditResult> {
  const order = await prisma.order.findFirst({
    // 손님이 고칠 때는 자기 것인지 함께 본다 — 주문번호만으로는 남의 주소를 바꿀 수 있다
    where: {
      orderNo,
      ...(by.userId ? { userId: by.userId } : {}),
      ...(by.merchantId ? { items: { some: { merchantId: by.merchantId } } } : {}),
    },
    select: {
      id: true, orderNo: true, status: true, shippingFee: true, payable: true, isRemoteArea: true,
      recipient: true, recipientPhone: true, postalCode: true, address1: true, address2: true,
      deliveryMemo: true,
      payment: { select: { method: true, status: true } },
    },
  });
  if (!order) throw new AddressEditError('ORDER_NOT_FOUND', 404);

  const nowRemote = isRemoteAreaPostalCode(input.postalCode);
  const pay = order.payment;

  const blocked = checkAddressEdit({
    status: order.status,
    settled: pay !== null && isPaidStatus(pay.status),
    awaitingDeposit: pay !== null && awaitingDeposit(pay.method, pay.status),
    wasRemote: order.isRemoteArea,
    nowRemote,
  });
  if (blocked) throw new AddressEditError(blocked);

  const policy = await getShippingPolicy();
  const delta = remoteSurchargeDelta({
    wasRemote: order.isRemoteArea,
    nowRemote,
    surcharge: policy.remoteSurcharge,
  });

  /*
   * **주소와 금액을 한 번에 쓴다.** 따로 쓰면 주소만 바뀌고 배송비는 옛 권역인 주문이 생기고,
   * 그 어긋남은 결제나 정산에서야 드러난다.
   *
   * 읽은 상태를 조건에 싣는다 — 그사이 출고됐으면(운영자가 송장을 붙였으면) 위 판단은 이미 낡았다.
   */
  const after: AddressSnapshot = {
    recipient: input.recipient,
    phone: normalizePhone(input.phone),
    postalCode: input.postalCode,
    address1: input.address1,
    address2: input.address2 ?? null,
    memo: input.deliveryMemo ?? null,
    isRemoteArea: nowRemote,
  };

  const { count } = await prisma.order.updateMany({
    where: { id: order.id, status: order.status },
    data: {
      recipient: after.recipient,
      recipientPhone: after.phone,
      postalCode: after.postalCode,
      address1: after.address1,
      address2: after.address2,
      deliveryMemo: after.memo,
      // 요청이 아니라 우편번호에서 정한다 — 받아 쓰면 제주 주소로 추가 배송비를 피할 수 있다
      isRemoteArea: nowRemote,
      ...(delta === 0
        ? {}
        : { shippingFee: { increment: delta }, payable: { increment: delta } }),
    },
  });
  if (count === 0) throw new AddressEditError('ALREADY_SHIPPED');

  return {
    orderNo: order.orderNo,
    shippingDelta: delta,
    shippingFee: order.shippingFee + delta,
    payable: order.payable + delta,
    isRemoteArea: nowRemote,
    before: {
      recipient: order.recipient,
      phone: order.recipientPhone,
      postalCode: order.postalCode,
      address1: order.address1,
      address2: order.address2,
      memo: order.deliveryMemo,
      isRemoteArea: order.isRemoteArea,
    },
    after,
  };
}
