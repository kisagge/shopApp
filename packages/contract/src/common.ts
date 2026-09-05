import { z } from 'zod';

/** 원화 금액. 소수점·음수·비정상 값을 경계에서 막는다. */
export const wonSchema = z
  .int('valid.moneyInteger')
  .nonnegative('valid.moneyMin')
  .max(Number.MAX_SAFE_INTEGER);

export const quantitySchema = z
  .int('valid.quantityInteger')
  .min(1, 'valid.quantityMin')
  .max(99, 'valid.quantityMax');

export const discountPercentSchema = z
  .number()
  .min(0, 'valid.percentMin')
  .max(100, 'valid.percentMax');

/**
 * Prisma 가 만드는 식별자.
 *
 * 이름만 cuid 이고 실제로는 "비어 있지 않은 문자열" 이었다. 그래서 형식부터
 * 틀린 값이 검증을 통과해 뒤쪽에서 조용히 버려졌다 — 잘못된 입력은 조용히
 * 무시하지 말고 그 자리에서 거절해야 무엇이 잘못됐는지 알 수 있다.
 *
 * 길이 폭을 넉넉히 둔 것은 cuid 버전에 따라 25~32자로 갈리기 때문이다.
 */
export const cuidSchema = z
  .string()
  .regex(/^[a-z0-9]{20,32}$/, 'valid.idFormat');

/**
 * 사람이 읽는 주문번호. YYYYMMDD-NNNNNNN.
 *
 * 내부 id 와 다르다. 고객·운영자·이벤트 로그가 주고받는 것은 이쪽이라
 * cuid 로 받으면 안 된다 — 실제로 이벤트 계약이 cuid 라고 적어 두고
 * 주문번호를 받고 있었다.
 */
export const orderNoSchema = z
  .string()
  .regex(/^\d{8}-\d{7}$/, 'valid.orderNoFormat');

/** 실패 응답. 필드 단위 에러를 폼에 그대로 연결할 수 있게 담는다. */
export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  fields: z.record(z.string(), z.string()).optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
