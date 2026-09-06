import { z } from 'zod';
import { LINE_ISSUE } from '@shop/core';
import { cuidSchema, discountPercentSchema, quantitySchema, wonSchema } from './common';

/**
 * 장바구니 견적 계약.
 *
 * **요청에는 금액이 없다.** 클라이언트는 "무엇을 몇 개" 만 말하고, 가격·재고·
 * 쿠폰은 전부 서버가 DB 에서 조회한다. 가격을 요청에 실으면 조작할 수 있고,
 * 담아 둔 사이에 값이 바뀌었는지도 알 수 없다.
 */

export const cartLineInputSchema = z.object({
  variantId: cuidSchema,
  quantity: quantitySchema,
});
export type CartLineInput = z.infer<typeof cartLineInputSchema>;

export const cartQuoteRequestSchema = z.object({
  lines: z.array(cartLineInputSchema).min(1, 'valid.noItems').max(100),
  /** 쿠폰도 코드만 받는다. 할인 조건은 서버가 안다. */
  couponCode: z.string().trim().min(1).max(64).optional(),
  pointsToUse: wonSchema.optional(),
  isRemoteArea: z.boolean().default(false),
});
export type CartQuoteRequest = z.infer<typeof cartQuoteRequestSchema>;

/** 담아 둔 사이에 생긴 문제. 화면이 사용자에게 알려 줘야 한다. */
// 값 목록은 core 가 갖고, 계약은 그것으로 스키마를 만든다.
export { LINE_ISSUE, type LineIssue } from '@shop/core';

/*
 * 문구는 여기 없다.
 *
 * 계약은 서버와 클라이언트가 주고받는 **모양**을 정하는 곳이고, 그 코드를
 * 뭐라고 부를지는 화면이 정한다 — 화면이 세 나라 말로 나가기 때문이다.
 * 이 파일에 한국어 문장을 두면 계약이 한국어 전용이 된다.
 */

export const cartQuoteLineSchema = z.object({
  variantId: cuidSchema,
  productSlug: z.string(),
  productName: z.string(),
  brandName: z.string(),
  optionLabel: z.string(),
  listPrice: wonSchema,
  /** 할인 적용 후 단가 */
  unitPrice: wonSchema,
  /** 표시용 할인율. 서버가 계산한다. */
  discountPercent: discountPercentSchema,
  /** 실제로 견적에 반영된 수량. 재고가 모자라면 줄어든다. */
  quantity: z.int().min(0),
  /** 요청한 수량. 화면이 "3개 요청했지만 2개만 가능" 을 보여 줄 수 있다. */
  requestedQuantity: quantitySchema,
  subtotal: wonSchema,
  stock: z.int().min(0),
  issue: z.enum(LINE_ISSUE).nullable(),
});
export type CartQuoteLine = z.infer<typeof cartQuoteLineSchema>;

export const cartQuoteResponseSchema = z.object({
  lines: z.array(cartQuoteLineSchema),
  listTotal: wonSchema,
  productDiscount: wonSchema,
  merchandiseTotal: wonSchema,
  couponDiscount: wonSchema,
  /** 적용된 쿠폰 이름. 코드가 유효하지 않으면 null */
  couponName: z.string().nullable(),
  pointsUsed: wonSchema,
  pointsAvailable: wonSchema,
  shippingFee: wonSchema,
  isFreeShipping: z.boolean(),
  remainingForFreeShipping: wonSchema,
  payable: wonSchema,
  rewardPoints: wonSchema,
});
export type CartQuoteResponse = z.infer<typeof cartQuoteResponseSchema>;
