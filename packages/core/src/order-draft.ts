import type { Won } from './money';
import type { OrderStatus } from './order-state';

/**
 * 주문을 만들 때 DB 에 박을 값들.
 *
 * **여기 있는 값은 전부 그 시점의 스냅샷이다.** 상품명·브랜드·옵션·단가는
 * 물론 배송지까지 복사한다. 고객이 주소를 고치거나 상품명이 바뀌어도
 * 이미 발생한 주문 내역은 변하면 안 된다.
 */
export interface OrderItemDraft {
  readonly variantId: string;
  readonly merchantId: string | null;
  readonly productName: string;
  readonly brandName: string;
  readonly optionLabel: string;
  readonly imageUrl: string | null;
  readonly listPrice: Won;
  readonly unitPrice: Won;
  readonly quantity: number;
  readonly subtotal: Won;
  /** 이 줄 몫의 쿠폰·포인트·적립. 부분 취소가 쓴다(partial-cancel) */
  readonly couponShare: Won;
  readonly pointsShare: Won;
  readonly rewardShare: Won;
}

export interface ShippingSnapshot {
  readonly recipient: string;
  readonly recipientPhone: string;
  readonly postalCode: string;
  readonly address1: string;
  readonly address2: string | null;
  readonly isRemoteArea: boolean;
  readonly deliveryMemo: string | null;
}

export interface OrderDraft {
  readonly orderNo: string;
  readonly userId: string;
  readonly status: OrderStatus;
  readonly items: readonly OrderItemDraft[];
  readonly shipping: ShippingSnapshot;
  readonly listTotal: Won;
  readonly productDiscount: Won;
  readonly couponDiscount: Won;
  readonly pointsUsed: Won;
  readonly shippingFee: Won;
  readonly payable: Won;
  readonly rewardPoints: Won;
  readonly usedCouponId: string | null;
}

/**
 * 결제 수단에 따라 주문이 시작하는 상태가 다르다.
 *
 * 가상계좌는 입금을 기다려야 하므로 PENDING 에서 시작한다.
 * 나머지는 결제 승인이 나야 주문이 성립하므로 역시 PENDING 에서 시작하고,
 * PG 승인 콜백이 PAID 로 옮긴다. **주문 생성 시점에 PAID 를 넣으면 안 된다** —
 * 승인 전에 결제된 것처럼 보이고, 승인이 실패해도 되돌릴 근거가 없다.
 */
export const INITIAL_ORDER_STATUS: OrderStatus = 'PENDING';
