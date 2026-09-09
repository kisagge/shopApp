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
  lines: z.array(cartLineInputSchema).min(1, 'valid.noItems').max(100, 'valid.tooManyItems'),
  /** 쿠폰도 코드만 받는다. 할인 조건은 서버가 안다. */
  couponCode: z.string().trim().min(1, 'valid.couponCodeRequired').max(64, 'valid.tooLongChars').optional(),
  /**
   * 쿠폰을 쓸 것인가.
   *
   * **아무것도 안 보내면 서버가 가장 많이 깎이는 것을 붙인다.** 사람이 코드를
   * 외워 넣게 하지 않으려는 것이다. 그래서 "안 쓰겠다" 는 뜻을 따로 말해야
   * 한다 — 코드를 비워 보내는 것만으로는 "아직 안 골랐다" 와 구분되지 않는다.
   */
  useCoupon: z.boolean().default(true),
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
  /**
   * 담은 것이 무엇인지 눈으로 확인할 수 있게.
   *
   * 예전에는 이 칸이 없어서 장바구니·주문서에 "IMG" 라고 적힌 회색 칸만
   * 있었다. **사는 과정 내내 사진이 사라지는 셈**이라, 옵션이 비슷한 상품을
   * 여럿 담으면 무엇이 무엇인지 구별할 방법이 없었다.
   *
   * 없을 수 있다 — 사진을 아직 안 올린 상품이 있다.
   */
  imageUrl: z.string().nullable(),
  imageAlt: z.string().nullable(),
  /** 사진이 도착하기 전 깔 자리표시. 살아 있는 상품에서 읽으므로 그냥 따라온다. */
  blurDataUrl: z.string().nullable(),
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

/**
 * 이 장바구니에 쓸 수 있는 내 쿠폰 하나.
 *
 * **깎이는 금액을 견적이 직접 계산해 준다.** 화면이 따로 세면 결제 금액과
 * 어긋나는 날이 오고, 그때 사람은 어느 쪽을 믿어야 할지 알 수 없다.
 * 못 쓰는 쿠폰도 `discount: 0` 으로 함께 온다 — 목록에서 빼면 "내 쿠폰이
 * 어디 갔지" 가 된다.
 */
export const cartCouponOfferSchema = z.object({
  code: z.string(),
  name: z.string(),
  discount: wonSchema,
  expiresAt: z.string(),
});
export type CartCouponOffer = z.infer<typeof cartCouponOfferSchema>;

export const cartQuoteResponseSchema = z.object({
  lines: z.array(cartQuoteLineSchema),
  listTotal: wonSchema,
  productDiscount: wonSchema,
  merchandiseTotal: wonSchema,
  couponDiscount: wonSchema,
  /** 적용된 쿠폰 이름. 코드가 유효하지 않으면 null */
  couponName: z.string().nullable(),
  /** 실제로 붙은 쿠폰 코드. 서버가 골라 붙였을 수도 있어 화면이 이 값을 봐야 한다. */
  couponCode: z.string().nullable(),
  /** 쓸 수 있는 것이 앞에, 많이 깎이는 순. 비로그인은 빈 목록이다. */
  coupons: z.array(cartCouponOfferSchema),
  pointsUsed: wonSchema,
  pointsAvailable: wonSchema,
  shippingFee: wonSchema,
  isFreeShipping: z.boolean(),
  remainingForFreeShipping: wonSchema,
  payable: wonSchema,
  rewardPoints: wonSchema,
});
export type CartQuoteResponse = z.infer<typeof cartQuoteResponseSchema>;
