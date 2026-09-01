import { z } from 'zod';
import { MAX_CART_LINES, MAX_QUANTITY } from '@shop/core';
import { cuidSchema } from './common';

/**
 * 장바구니 동기화 계약.
 *
 * **금액은 주고받지 않는다.** 무엇을 몇 개 담았는지만 오간다 —
 * 금액은 /api/cart/quote 가 서버에서 다시 계산한다.
 */
const cartLineSchema = z.object({
  variantId: cuidSchema,
  quantity: z.int().min(1).max(MAX_QUANTITY),
  selected: z.boolean(),
});

export const cartSyncSchema = z.object({
  lines: z.array(cartLineSchema).max(MAX_CART_LINES),
});
export type CartSyncInput = z.infer<typeof cartSyncSchema>;
