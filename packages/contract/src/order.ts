import { z } from 'zod';
import { ORDER_NOTE_MAX, PAYMENT_METHOD_CODE, type PaymentMethodCode } from '@shop/core';
import { cartLineInputSchema } from './cart';
import { cuidSchema, wonSchema } from './common';

/**
 * 주문 생성 계약.
 *
 * 장바구니 견적과 같은 원칙 — **요청에 금액이 없다.** 결제 금액은 서버가
 * 다시 계산한다. 화면이 보여 준 금액과 실제 청구액이 다르면 그건 서버가
 * 다시 계산했다는 뜻이고, 그때는 주문을 만들지 않고 사용자에게 다시 보여 준다.
 */

/** 목록은 core 의 PAYMENT_METHOD_CODE 다 — 계약은 그것으로 스키마만 만든다 */
export type PaymentMethodInput = PaymentMethodCode;

/**
 * 새로 입력한 배송지.
 *
 * **isRemoteArea 가 없다.** 추가 배송비가 걸린 값이라 요청으로 받으면
 * 제주 주소에 false 를 보내 3,000원을 피할 수 있다. 서버가 우편번호에서
 * 판정한다 — core 의 isRemoteAreaPostalCode.
 */
export const shippingAddressSchema = z.object({
  recipient: z.string().trim().min(1, 'valid.recipientRequired').max(50, 'valid.tooLongChars'),
  phone: z
    .string()
    .trim()
    // 하이픈·공백을 섞어 쓰거나 아예 안 쓰는 사람이 많다. 어차피 저장할 때
    // 한 모양으로 통일하므로(core 의 normalizePhone) 입력 단계에서 막을 이유가 없다.
    .regex(/^01[016789][-\s]?\d{3,4}[-\s]?\d{4}$/, 'valid.phoneFormat'),
  postalCode: z.string().trim().regex(/^\d{5}$/, 'valid.zipFormat'),
  address1: z.string().trim().min(1, 'valid.addressRequired').max(200, 'valid.tooLongChars'),
  address2: z.string().trim().max(200, 'valid.tooLongChars').optional(),
});
export type ShippingAddressInput = z.infer<typeof shippingAddressSchema>;

export const createOrderRequestSchema = z
  .object({
    lines: z.array(cartLineInputSchema).min(1, 'valid.noItems').max(100, 'valid.tooManyItems'),
    /** 저장된 배송지를 쓰거나, 새로 입력하거나 — 둘 중 하나여야 한다 */
    addressId: cuidSchema.optional(),
    address: shippingAddressSchema.optional(),
    deliveryMemo: z.string().trim().max(100, 'valid.tooLongChars').optional(),
    couponCode: z.string().trim().min(1, 'valid.couponCodeRequired').max(64, 'valid.tooLongChars').optional(),
    pointsToUse: wonSchema.optional(),
    /** 브라우저 세션 식별자. 퍼널 연결용이라 없어도 주문은 된다. */
    browserSessionId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{8,64}$/, 'valid.idFormat')
      .optional(),
    /**
     * 같은 주문을 두 번 만들지 않기 위한 열쇠.
     *
     * 화면이 결제 시도마다 하나를 만들어 보낸다. 없어도 주문은 되지만,
     * 없으면 **버튼을 두 번 누른 만큼 주문이 생긴다.**
     */
    idempotencyKey: z
      .string()
      .regex(/^[A-Za-z0-9-]{16,64}$/, 'valid.idFormat')
      .optional(),
    paymentMethod: z.enum(PAYMENT_METHOD_CODE),
    /** 약관 동의 없이 주문을 만들지 않는다 */
    agreedToTerms: z.literal(true, 'valid.agreeRequired'),
  })
  .refine((v) => v.addressId !== undefined || v.address !== undefined, {
    message: 'valid.addressPick',
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

/** 주문 내부 메모 한 줄. 누가·어느 가맹점으로 남기는지는 세션이 정한다 */
export const orderNoteSchema = z.object({
  body: z.string({ error: 'valid.required' }).trim().min(1, 'valid.required').max(ORDER_NOTE_MAX, 'valid.tooLongChars'),
});
export type OrderNoteInput = z.infer<typeof orderNoteSchema>;
