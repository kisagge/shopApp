import { z } from 'zod';

/** 원화 금액. 소수점·음수·비정상 값을 경계에서 막는다. */
export const wonSchema = z
  .int('금액은 정수여야 합니다')
  .nonnegative('금액은 0 이상이어야 합니다')
  .max(Number.MAX_SAFE_INTEGER);

export const quantitySchema = z
  .int('수량은 정수여야 합니다')
  .min(1, '수량은 1개 이상이어야 합니다')
  .max(99, '한 번에 99개까지 담을 수 있습니다');

export const discountPercentSchema = z
  .number()
  .min(0, '할인율은 0 이상이어야 합니다')
  .max(100, '할인율은 100 이하여야 합니다');

export const cuidSchema = z.string().min(1, '식별자가 비어 있습니다');

/** 실패 응답. 필드 단위 에러를 폼에 그대로 연결할 수 있게 담는다. */
export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  fields: z.record(z.string(), z.string()).optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
