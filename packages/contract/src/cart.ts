import { z } from 'zod';
import { cuidSchema, discountPercentSchema, quantitySchema, wonSchema } from './common';

export const cartLineInputSchema = z.object({
  variantId: cuidSchema,
  productName: z.string().min(1),
  listPrice: wonSchema,
  discountPercent: discountPercentSchema,
  quantity: quantitySchema,
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
