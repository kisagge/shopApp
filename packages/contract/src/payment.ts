import { z } from 'zod';
import { wonSchema } from './common';

export const confirmPaymentRequestSchema = z.object({
  paymentKey: z.string().trim().min(1).max(200),
  /**
   * 화면이 본 금액. **이 값으로 승인하지 않는다** — 주문에 저장된 금액과
   * 같은지 확인하는 용도다. 다르면 승인을 진행하지 않는다.
   */
  amount: wonSchema,
});
export type ConfirmPaymentRequest = z.infer<typeof confirmPaymentRequestSchema>;

export const cancelOrderRequestSchema = z.object({
  reason: z.string().trim().min(1, '취소 사유를 입력해 주세요').max(200),
});
export type CancelOrderRequest = z.infer<typeof cancelOrderRequestSchema>;
