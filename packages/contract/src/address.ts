import { z } from 'zod';
import { PHONE_PATTERN } from '@shop/core';

/**
 * 배송지 입력 계약.
 *
 * **isRemoteArea 를 받지 않는다.** 추가 배송비가 걸린 값이라 클라이언트가
 * 정하게 두면 제주 주소에 false 를 보내 3,000원을 피할 수 있다.
 * 서버가 우편번호에서 판정한다 — core 의 isRemoteAreaPostalCode.
 */
export const addressInputSchema = z.object({
  label: z.string().trim().max(20, 'valid.tooLongChars').optional(),
  recipient: z.string().trim().min(1, 'valid.recipientRequired').max(50, 'valid.tooLongChars'),
  phone: z
    .string()
    .trim()
    // 하이픈·공백을 섞어 쓰거나 아예 안 쓰는 사람이 많다. 어차피 저장할 때
    // 한 모양으로 통일하므로(core 의 normalizePhone) 입력 단계에서 막을 이유가 없다.
    .regex(PHONE_PATTERN, 'valid.phoneFormat'),
  postalCode: z.string().trim().regex(/^\d{5}$/, 'valid.zipFormat'),
  address1: z.string().trim().min(1, 'valid.addressRequired').max(200, 'valid.tooLongChars'),
  address2: z.string().trim().max(200, 'valid.tooLongChars').optional(),
  /** 기본 배송지로 삼을지. 첫 배송지는 이 값과 무관하게 기본이 된다. */
  isDefault: z.boolean().default(false),
});
export type AddressInput = z.infer<typeof addressInputSchema>;

/**
 * 반품지 입력 계약 — 가맹점과 플랫폼 반품지가 같이 쓴다.
 *
 * 배송지와 칸이 같다. 연락처는 **반품 담당자의 휴대폰**이다 — 택배 기사가 도착 전에 거는 번호라 받는 사람이 곧바로
 * 받아야 한다.
 */
export const returnAddressInputSchema = addressInputSchema.pick({
  recipient: true, phone: true, postalCode: true, address1: true, address2: true,
});
export type ReturnAddressInput = z.infer<typeof returnAddressInputSchema>;
