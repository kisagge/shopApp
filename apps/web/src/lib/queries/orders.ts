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
      listTotal: true, productDiscount: true, couponDiscount: true,
      pointsUsed: true, shippingFee: true, payable: true, rewardPoints: true,
      recipient: true, recipientPhone: true, postalCode: true,
      address1: true, address2: true, deliveryMemo: true,
      payment: { select: { method: true, status: true } },
      items: {
        select: {
          productName: true, brandName: true, optionLabel: true,
          listPrice: true, unitPrice: true, quantity: true, subtotal: true,
        },
      },
    },
  });
}
