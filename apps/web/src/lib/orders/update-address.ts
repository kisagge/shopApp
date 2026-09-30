import 'server-only';
import { prisma } from '@shop/db';
import {
  checkAddressEdit, isRemoteAreaPostalCode, normalizePhone, remoteSurchargeDelta,
  isPaidStatus, awaitingDeposit, changedAddressFields, format, won,
  type AddressEditBlock, type AddressField,
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
  by: {
    readonly userId?: string;
    readonly merchantId?: string;
    /** 운영·가맹점이 고칠 때 처리 이력에 찍히는 사람. 손님이 고치면 userId 가 그 자리다 */
    readonly actorId?: string;
  },
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

  const before: AddressSnapshot = {
    recipient: order.recipient,
    phone: order.recipientPhone,
    postalCode: order.postalCode,
    address1: order.address1,
    address2: order.address2,
    memo: order.deliveryMemo,
    isRemoteArea: order.isRemoteArea,
  };
  const changed = changedAddressFields(before, after);

  /*
   * **고친 것과 그 기록을 한 트랜잭션에 묶는다.** 기록이 따로 떨어지면, 바뀐 주소는 남았는데 바뀌었다는
   * 사실은 어디에도 없는 주문이 생긴다 — 출고 직전이라면 그것이 가장 위험한 조합이다.
   */
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.order.updateMany({
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

    /*
     * **출고 직전에 주소가 바뀌면 운영자는 알 길이 없었다.** 화면에는 새 주소가 보이지만, 피킹 목록을
     * 이미 뽑았거나 송장을 붙이려던 사람에게는 그 사실이 어디에도 나타나지 않는다. 처리 이력에 한 줄을
     * 남긴다 — 상태가 바뀌는 일이 아니므로 from 과 to 를 같게 둔다(반품 회수 확인과 같은 방식).
     *
     * 같은 값을 다시 저장한 것은 남기지 않는다. 이력이 길어지면 정작 달라진 줄을 못 찾는다.
     */
    if (changed.length > 0 || delta !== 0) {
      await tx.orderStatusLog.create({
        data: {
          orderId: order.id,
          from: order.status,
          to: order.status,
          actor: by.userId ?? by.actorId ?? 'system',
          note: changeNote(changed, delta, by),
        },
      });
    }
  });

  return {
    orderNo: order.orderNo,
    shippingDelta: delta,
    shippingFee: order.shippingFee + delta,
    payable: order.payable + delta,
    isRemoteArea: nowRemote,
    before,
    after,
  };
}

/** 처리 이력에 적을 한 줄. 운영진이 읽는 자리라 한국어로 둔다(api/respond 의 주석) */
const FIELD_LABEL: Readonly<Record<AddressField, string>> = {
  recipient: '받는 분',
  phone: '연락처',
  postalCode: '우편번호',
  address1: '주소',
  address2: '상세주소',
  memo: '요청사항',
};

function changeNote(
  changed: readonly AddressField[],
  delta: number,
  by: {
    readonly userId?: string;
    readonly merchantId?: string;
    /** 운영·가맹점이 고칠 때 처리 이력에 찍히는 사람. 손님이 고치면 userId 가 그 자리다 */
    readonly actorId?: string;
  },
): string {
  // 누가 고쳤는지가 먼저다 — 손님이 고친 것과 운영이 고친 것은 그다음 할 일이 다르다
  const who = by.userId ? '손님' : by.merchantId ? '가맹점' : '운영';
  const what = changed.map((field) => FIELD_LABEL[field]).join('·');
  const money = delta === 0 ? '' : ` · 배송비 ${delta > 0 ? '+' : '-'}${format(won(Math.abs(delta)))}원`;
  return `배송지 변경 (${who})${what ? ` — ${what}` : ''}${money}`;
}
