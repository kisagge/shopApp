import { z } from 'zod';
import { cartLineInputSchema } from './cart';
import { cuidSchema, wonSchema } from './common';

/**
 * 주문 생성 계약.
 *
 * 장바구니 견적과 같은 원칙 — **요청에 금액이 없다.** 결제 금액은 서버가
 * 다시 계산한다. 화면이 보여 준 금액과 실제 청구액이 다르면 그건 서버가
 * 다시 계산했다는 뜻이고, 그때는 주문을 만들지 않고 사용자에게 다시 보여 준다.
 */

export const PAYMENT_METHOD = ['CARD', 'TRANSFER', 'VIRTUAL_ACCOUNT', 'EASY_PAY'] as const;
export type PaymentMethodInput = (typeof PAYMENT_METHOD)[number];

/**
 * 새로 입력한 배송지.
 *
 * **isRemoteArea 가 없다.** 추가 배송비가 걸린 값이라 요청으로 받으면
 * 제주 주소에 false 를 보내 3,000원을 피할 수 있다. 서버가 우편번호에서
 * 판정한다 — core 의 isRemoteAreaPostalCode.
 */
export const shippingAddressSchema = z.object({
  recipient: z.string().trim().min(1, '받는 분을 입력해 주세요').max(50),
  phone: z
    .string()
    .trim()
    // 하이픈·공백을 섞어 쓰거나 아예 안 쓰는 사람이 많다. 어차피 저장할 때
    // 한 모양으로 통일하므로(core 의 normalizePhone) 입력 단계에서 막을 이유가 없다.
    .regex(/^01[016789][-\s]?\d{3,4}[-\s]?\d{4}$/, '휴대폰 번호 형식이 올바르지 않습니다'),
  postalCode: z.string().trim().regex(/^\d{5}$/, '우편번호는 5자리입니다'),
  address1: z.string().trim().min(1, '주소를 입력해 주세요').max(200),
  address2: z.string().trim().max(200).optional(),
});
export type ShippingAddressInput = z.infer<typeof shippingAddressSchema>;

export const createOrderRequestSchema = z
  .object({
    lines: z.array(cartLineInputSchema).min(1, '주문할 상품이 없습니다').max(100),
    /** 저장된 배송지를 쓰거나, 새로 입력하거나 — 둘 중 하나여야 한다 */
    addressId: cuidSchema.optional(),
    address: shippingAddressSchema.optional(),
    deliveryMemo: z.string().trim().max(100).optional(),
    couponCode: z.string().trim().min(1).max(64).optional(),
    pointsToUse: wonSchema.optional(),
    /** 브라우저 세션 식별자. 퍼널 연결용이라 없어도 주문은 된다. */
    browserSessionId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{8,64}$/)
      .optional(),
    paymentMethod: z.enum(PAYMENT_METHOD),
    /** 약관 동의 없이 주문을 만들지 않는다 */
    agreedToTerms: z.literal(true, '약관에 동의해야 주문할 수 있습니다'),
  })
  .refine((v) => v.addressId !== undefined || v.address !== undefined, {
    message: '배송지를 선택하거나 입력해 주세요',
    path: ['address'],
  });
export type CreateOrderRequest = z.infer<typeof createOrderRequestSchema>;

export const createOrderResponseSchema = z.object({
  orderNo: z.string(),
  payable: wonSchema,
  status: z.string(),
});
export type CreateOrderResponse = z.infer<typeof createOrderResponseSchema>;

/**
 * 주문이 실패한 이유. 화면이 코드를 보고 다르게 반응해야 한다 —
 * 품절이면 장바구니로 되돌리고, 포인트 부족이면 그 필드만 고치게 한다.
 */
export const ORDER_ERROR = [
  'OUT_OF_STOCK',
  'PRICE_CHANGED',
  'ADDRESS_NOT_FOUND',
  'INSUFFICIENT_POINTS',
  'COUPON_INVALID',
  'EMPTY_ORDER',
] as const;
export type OrderErrorCode = (typeof ORDER_ERROR)[number];

export const ORDER_ERROR_MESSAGE: Readonly<Record<OrderErrorCode, string>> = {
  OUT_OF_STOCK: '재고가 부족한 상품이 있습니다',
  PRICE_CHANGED: '가격이 변경되었습니다. 금액을 다시 확인해 주세요',
  ADDRESS_NOT_FOUND: '배송지를 찾을 수 없습니다',
  INSUFFICIENT_POINTS: '보유 포인트가 부족합니다',
  COUPON_INVALID: '사용할 수 없는 쿠폰입니다',
  EMPTY_ORDER: '주문할 수 있는 상품이 없습니다',
};

export const orderErrorSchema = z.object({
  code: z.enum(ORDER_ERROR),
  message: z.string(),
  /** 품절 등 특정 상품 때문이면 어떤 것인지 알려 준다 */
  variantIds: z.array(cuidSchema).optional(),
});
export type OrderError = z.infer<typeof orderErrorSchema>;
