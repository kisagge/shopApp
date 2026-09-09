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
