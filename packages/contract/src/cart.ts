import { z } from 'zod';
// discountPercentSchema 는 쿠폰의 정률 할인에 계속 쓴다.
// 상품 가격은 판매가를 저장하는 쪽으로 바뀌었지만 쿠폰은 여전히 비율이다.
import { cuidSchema, discountPercentSchema, quantitySchema, wonSchema } from './common';

export const cartLineInputSchema = z
  .object({
    variantId: cuidSchema,
    productName: z.string().min(1),
    /** 정가 */
    listPrice: wonSchema,
    /** 실제 판매 단가. 할인이 없으면 listPrice 와 같다. */
    salePrice: wonSchema,
    quantity: quantitySchema,
  })
  .refine((l) => l.salePrice <= l.listPrice, {
    message: '판매가가 정가보다 클 수 없습니다',
    path: ['salePrice'],
  });
export type CartLineInput = z.infer<typeof cartLineInputSchema>;

export const couponInputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('amount'),
    code: z.string().min(1),
    value: wonSchema,
    minimumOrder: wonSchema,
  }),
  z.object({
    kind: z.literal('percent'),
    code: z.string().min(1),
    percent: discountPercentSchema,
    maxDiscount: wonSchema.nullable(),
    minimumOrder: wonSchema,
  }),
]);
export type CouponInput = z.infer<typeof couponInputSchema>;

export const cartQuoteRequestSchema = z.object({
  lines: z.array(cartLineInputSchema).min(1, '주문할 상품이 없습니다').max(100),
  coupon: couponInputSchema.optional(),
  pointsToUse: wonSchema.optional(),
  isRemoteArea: z.boolean().default(false),
});
export type CartQuoteRequest = z.infer<typeof cartQuoteRequestSchema>;

export const cartQuoteResponseSchema = z.object({
  listTotal: wonSchema,
  productDiscount: wonSchema,
  merchandiseTotal: wonSchema,
  couponDiscount: wonSchema,
  pointsUsed: wonSchema,
  shippingFee: wonSchema,
  isFreeShipping: z.boolean(),
  remainingForFreeShipping: wonSchema,
  payable: wonSchema,
  rewardPoints: wonSchema,
});
export type CartQuoteResponse = z.infer<typeof cartQuoteResponseSchema>;
