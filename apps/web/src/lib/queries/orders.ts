import 'server-only';
import { prisma } from '@shop/db';
import { checkExchangeOption } from '@shop/core';

/** 체크아웃에서 쓸 기본 배송지 */
export async function getDefaultAddress(userId: string) {
  return prisma.address.findFirst({
    where: { userId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true, label: true, recipient: true, phone: true,
      postalCode: true, address1: true, address2: true, isRemoteArea: true,
    },
  });
}

/**
 * 주문 상세.
 *
 * **소유자만 볼 수 있다.** 주문번호는 추측하기 어렵지만 URL 로 노출되므로
 * 번호를 아는 것만으로 남의 주문을 열 수 있으면 안 된다.
 */
export async function getOrderForUser(orderNo: string, userId: string) {
  return prisma.order.findFirst({
    where: { orderNo, userId },
    select: {
      orderNo: true, status: true, placedAt: true,
      // 영수증을 낼 수 있는지와 결제 일시. 결제대기 주문에는 영수증이 없다
      paidAt: true,
      listTotal: true, productDiscount: true, couponDiscount: true,
      pointsUsed: true, shippingFee: true, payable: true, rewardPoints: true,
      recipient: true, recipientPhone: true, postalCode: true,
      address1: true, address2: true, deliveryMemo: true,
      /*
       * 가상계좌 셋을 함께 읽는다. 저장만 하고 읽지 않아서, 입금 대기 주문이
       * 어느 은행 몇 번 계좌인지 화면에서 볼 길이 없었다 — 결제 직후 한 번과
       * 메일이 전부였고, 탭을 닫으면 그 주문은 화면에서 입금할 수 없었다.
       */
      payment: {
        select: {
          method: true, status: true,
          virtualAccount: true, virtualBank: true, virtualDueDate: true,
        },
      },
      // 돌려준 돈. 일부 취소한 주문은 결제완료인 채로 남으므로 상태만으로는 안 보인다
      refunds: {
        orderBy: { createdAt: 'asc' },
        select: { kind: true, amount: true, points: true, shippingDeducted: true, createdAt: true },
      },
      // 배송 조회. 송장이 없으면 null 이고 화면은 그 절을 통째로 감춘다.
      shipment: { select: { carrier: true, trackingNumber: true, shippedAt: true } },
      deliveredAt: true,
      // 가장 최근 신청이 현재 신청이다. 지난 것은 이력으로 남아 있다.
      returnRequests: {
        orderBy: { requestedAt: 'desc' },
        take: 1,
        select: {
          type: true, reason: true, detail: true, status: true,
          shippingBorneBy: true, rejectReason: true, requestedAt: true, itemIds: true,
          // 승인했고 아직 안 왔으면 손님에게 보낼 곳을 알려 준다(core showsReturnAddress)
          receivedAt: true,
          exchangeLines: { select: { orderItemId: true, fromOptionLabel: true, toOptionLabel: true, quantity: true } },
          reshipCarrier: true, reshipTrackingNumber: true,
        },
      },
      items: {
        orderBy: { id: 'asc' },
        select: {
          id: true, canceledAt: true, status: true,
          // 어느 판매처로 돌려보내는가 — 가맹점마다 반품지가 다르다
          merchantId: true,
          productName: true, brandName: true, optionLabel: true,
          // 주문한 그때의 사진. 상품이 바뀌거나 지워져도 산 것은 그대로 남아야 한다.
          imageUrl: true,
          listPrice: true, unitPrice: true, quantity: true, subtotal: true,
          // 교환 옵션을 고르려면 같은 상품·같은 추가금인지 알아야 한다
          variant: { select: { id: true, productId: true, priceOverride: true } },
        },
      },
    },
  });
}

export interface ExchangeOption {
  readonly variantId: string;
  readonly label: string;
}

/**
 * 줄마다 바꿀 수 있는 옵션 — 같은 상품·같은 추가금·판매 중·수량만큼 재고(core checkExchangeOption).
 *
 * 화면이 내미는 목록과 서버가 받는 조건이 **같은 함수**다. 화면이 고를 수 있게 둔 옵션을 신청에서 거절하면 손님은
 * 무엇을 골라야 하는지 알 수 없다. 재고는 신청 순간 다시 본다 — 여기 목록은 열었을 때의 사정이다.
 */
export async function getExchangeOptions(
  items: readonly {
    id: string; quantity: number;
    variant: { id: string; productId: string; priceOverride: number | null };
  }[],
): Promise<Record<string, ExchangeOption[]>> {
  if (items.length === 0) return {};
  const siblings = await prisma.productVariant.findMany({
    where: { productId: { in: [...new Set(items.map((i) => i.variant.productId))] } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, productId: true, priceOverride: true, stock: true, isActive: true, label: true },
  });
  return Object.fromEntries(
    items.map((item) => [
      item.id,
      siblings
        .filter((c) =>
          checkExchangeOption(
            { productId: item.variant.productId, variantId: item.variant.id, priceOverride: item.variant.priceOverride, quantity: item.quantity },
            { productId: c.productId, variantId: c.id, priceOverride: c.priceOverride, stock: c.stock, isActive: c.isActive },
          ).ok)
        .map((c) => ({ variantId: c.id, label: c.label })),
    ]),
  );
}
