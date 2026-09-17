import { z } from 'zod';
import {
  BUSINESS_NUMBER_PATTERN, COMMISSION_MAX_PERCENT, COMMISSION_MIN_PERCENT,
  normalizeBusinessNumber, SETTLEMENT_BANK,
} from '@shop/core';

/**
 * 입점 신청 계약.
 *
 * 정산 계좌는 **받지 않는다.** 심사를 통과할지 모르는 시점에 계좌를
 * 모아 둘 이유가 없고, 승인 뒤 가맹점 화면에서 받는 편이 맞다.
 */
const trimmed = (max: number) =>
  z.string().trim().min(1, 'valid.tooShortChars').max(max, 'valid.tooLongChars');

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
  contactEmail: z.email('valid.emailFormat').max(120, 'valid.tooLongChars'),
  contactPhone: trimmed(20),
});
export type ApplyMerchantInput = z.infer<typeof applyMerchantSchema>;

/**
 * 가맹점 연락처와 정산 계좌.
 *
 * **사업자 정보는 여기 없다.** 상호·사업자등록번호·대표자는 정산과 세금계산서의 근거라 가맹점이 스스로 바꾸면 돈 받는
 * 주체가 심사 없이 바뀐다 — 그쪽은 운영진 몫이고 계약도 따로 둔다(core 의 canEditBusinessInfo).
 */
export const merchantSettingsSchema = z.object({
  contactEmail: z.email('valid.emailFormat').max(120, 'valid.tooLongChars'),
  contactPhone: trimmed(20),
  settlementBank: z.enum(SETTLEMENT_BANK, { error: 'valid.bankRequired' }),
  /**
   * 계좌번호.
   *
   * 숫자와 하이픈만 받는다 — 은행이 쓰는 표기가 그것뿐이고, 그 밖의 글자가 들어오면 대개 붙여 넣다 섞인 것이다.
   * 저장은 숫자만 남겨 한 모양으로 맞춘다: 같은 계좌가 하이픈 유무로 둘이 되면 바뀌었는지 알 수 없다.
   */
  settlementAccount: z
    .string()
    .trim()
    .regex(/^[\d-]+$/, 'valid.accountFormat')
    .transform((v) => v.replace(/\D/g, ''))
    .refine((v) => v.length >= 8 && v.length <= 20, 'valid.accountFormat'),
  settlementHolder: trimmed(20),
});
export type MerchantSettingsInput = z.infer<typeof merchantSettingsSchema>;

/** 사업자 정보. 운영진만 고친다 */
export const merchantBusinessSchema = z.object({
  name: trimmed(40),
  businessName: trimmed(60),
  businessNumber: z
    .string()
    .trim()
    .transform(normalizeBusinessNumber)
    .refine((v) => BUSINESS_NUMBER_PATTERN.test(v), 'valid.bizNumberFormat'),
  representative: trimmed(20),
});
export type MerchantBusinessInput = z.infer<typeof merchantBusinessSchema>;

/**
 * 수수료율 변경.
 *
 * **사유를 함께 받는다.** 요율은 플랫폼이 가져가는 몫이라, 숫자만 바뀐 기록은 나중에 "왜 12% 가 됐는가" 에 답하지
 * 못한다 — 감사 로그에 사유까지 남겨야 그 판단을 다시 볼 수 있다.
 */
export const merchantCommissionSchema = z.object({
  commissionPercent: z
    .int('valid.commissionRange')
    .min(COMMISSION_MIN_PERCENT, 'valid.commissionRange')
    .max(COMMISSION_MAX_PERCENT, 'valid.commissionRange'),
  reason: trimmed(200),
});
export type MerchantCommissionInput = z.infer<typeof merchantCommissionSchema>;

/**
 * 정산 지급 보류·해제.
 *
 * 보류는 **까닭을 적어야 한다** — 가맹점도 그 까닭을 본다. 들어올 돈이 왜 안 들어오는지 모르면 문의가 먼저 온다.
 * 풀 때는 까닭이 없어도 된다.
 */
export const settlementHoldSchema = z.discriminatedUnion('hold', [
  z.object({ hold: z.literal(true), reason: trimmed(200) }),
  z.object({ hold: z.literal(false) }),
]);
export type SettlementHoldInput = z.infer<typeof settlementHoldSchema>;
