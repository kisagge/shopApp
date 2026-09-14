import 'server-only';
import { prisma } from '@shop/db';

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
      payment: { select: { method: true, status: true } },
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
        },
      },
      items: {
        orderBy: { id: 'asc' },
        select: {
          id: true, canceledAt: true, status: true,
          productName: true, brandName: true, optionLabel: true,
          // 주문한 그때의 사진. 상품이 바뀌거나 지워져도 산 것은 그대로 남아야 한다.
          imageUrl: true,
          listPrice: true, unitPrice: true, quantity: true, subtotal: true,
        },
      },
    },
  });
}
