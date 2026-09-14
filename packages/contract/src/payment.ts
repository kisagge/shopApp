import { z } from 'zod';
import { wonSchema } from './common';

export const confirmPaymentRequestSchema = z.object({
  paymentKey: z.string().trim().min(1, 'valid.tooShortChars').max(200, 'valid.tooLongChars'),
  /**
   * 화면이 본 금액. **이 값으로 승인하지 않는다** — 주문에 저장된 금액과
   * 같은지 확인하는 용도다. 다르면 승인을 진행하지 않는다.
   */
  amount: wonSchema,
});
export type ConfirmPaymentRequest = z.infer<typeof confirmPaymentRequestSchema>;

export const cancelOrderRequestSchema = z.object({
  reason: z.string().trim().min(1, 'valid.cancelReasonRequired').max(200, 'valid.tooLongChars'),
});
export type CancelOrderRequest = z.infer<typeof cancelOrderRequestSchema>;

/**
 * 일부 상품 취소.
 *
 * `preview: true` 면 **아무것도 바꾸지 않고** 돌려받을 금액만 계산해 준다. 화면이 따로 세면
 * 쿠폰·포인트 몫과 배송비 차감이 결제 금액과 어긋나는 날이 온다 — 견적과 같은 이유다.
 *
 * 줄 id 는 20개까지. 한 주문에 그보다 많은 줄이 담기지 않는다.
 */
export const cancelItemsRequestSchema = z.object({
  itemIds: z
    .array(z.string().min(1, 'valid.tooShortChars').max(64, 'valid.tooLongChars'))
    .min(1, 'valid.noItems')
    .max(20, 'valid.tooManyItems'),
  reason: z.string().trim().min(1, 'valid.cancelReasonRequired').max(200, 'valid.tooLongChars'),
  preview: z.boolean().default(false),
});
export type CancelItemsRequest = z.infer<typeof cancelItemsRequestSchema>;

export const cancelItemsPreviewSchema = z.object({
  /** partial: 일부 취소 · full: 남는 상품이 없어 주문 전체가 취소된다 */
  kind: z.enum(['partial', 'full']),
  /** 결제 수단으로 돌려받을 돈 */
  cash: z.int().min(0),
  /** 포인트로 돌려받을 몫 */
  points: z.int().min(0),
  /** 남은 상품이 무료배송 기준 아래로 떨어져 뗀 배송비 */
  shippingDeducted: z.int().min(0),
});
export type CancelItemsPreviewResponse = z.infer<typeof cancelItemsPreviewSchema>;
