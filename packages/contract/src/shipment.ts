import { z } from 'zod';
import { CARRIER_CODE } from '@shop/core';

/**
 * 송장 등록 계약.
 *
 * 송장번호는 하이픈·공백을 섞어 넣어도 받는다. 서버가 숫자만 남겨
 * 저장하므로 입력 단계에서 막을 이유가 없다 — 사람은 종이에 적힌 대로 친다.
 */
export const registerShipmentSchema = z.object({
  carrier: z.enum(CARRIER_CODE),
  trackingNumber: z
    .string()
    .trim()
    .min(1, 'valid.trackingRequired')
    .max(40, 'valid.tooLongChars')
    .refine((v) => {
      const digits = v.replace(/\D/g, '');
      return digits.length >= 9 && digits.length <= 20;
    }, 'valid.trackingFormat'),
});
export type RegisterShipmentInput = z.infer<typeof registerShipmentSchema>;
