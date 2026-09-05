import { z } from 'zod';
import { BUSINESS_NUMBER_PATTERN, normalizeBusinessNumber } from '@shop/core';

/**
 * 입점 신청 계약.
 *
 * 정산 계좌는 **받지 않는다.** 심사를 통과할지 모르는 시점에 계좌를
 * 모아 둘 이유가 없고, 승인 뒤 가맹점 화면에서 받는 편이 맞다.
 */
const trimmed = (max: number) => z.string().trim().min(1).max(max);

export const applyMerchantSchema = z.object({
  /** 운영진 화면에 뜨는 이름 */
  name: trimmed(40),
  /** 매대에 뜨는 브랜드 이름. 승인하면 이 이름으로 브랜드가 만들어진다. */
  brandName: trimmed(40),
  businessName: trimmed(60),
  businessNumber: z
    .string()
    .trim()
    // 하이픈을 빼고 적는 사람이 많다. 거절하지 말고 표준 표기로 맞춘다.
    .transform(normalizeBusinessNumber)
    .refine((v) => BUSINESS_NUMBER_PATTERN.test(v), 'valid.bizNumberFormat'),
  representative: trimmed(20),
  contactEmail: z.email('valid.emailFormat').max(120),
  contactPhone: trimmed(20),
});
export type ApplyMerchantInput = z.infer<typeof applyMerchantSchema>;
