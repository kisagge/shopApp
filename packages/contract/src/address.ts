import { z } from 'zod';

/**
 * 배송지 입력 계약.
 *
 * **isRemoteArea 를 받지 않는다.** 추가 배송비가 걸린 값이라 클라이언트가
 * 정하게 두면 제주 주소에 false 를 보내 3,000원을 피할 수 있다.
 * 서버가 우편번호에서 판정한다 — core 의 isRemoteAreaPostalCode.
 */
export const addressInputSchema = z.object({
  label: z.string().trim().max(20).optional(),
  recipient: z.string().trim().min(1, '받는 분을 입력해 주세요').max(50),
  phone: z
    .string()
    .trim()
    // 하이픈·공백을 섞어 쓰거나 아예 안 쓰는 사람이 많다. 어차피 저장할 때
    // 한 모양으로 통일하므로(core 의 normalizePhone) 입력 단계에서 막을 이유가 없다.
    .regex(/^01[016789][-\s]?\d{3,4}[-\s]?\d{4}$/, '휴대폰 번호 형식이 올바르지 않습니다'),
  postalCode: z.string().trim().regex(/^\d{5}$/, '우편번호는 5자리 숫자입니다'),
  address1: z.string().trim().min(1, '주소를 입력해 주세요').max(200),
  address2: z.string().trim().max(200).optional(),
  /** 기본 배송지로 삼을지. 첫 배송지는 이 값과 무관하게 기본이 된다. */
  isDefault: z.boolean().default(false),
});
export type AddressInput = z.infer<typeof addressInputSchema>;
