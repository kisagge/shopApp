import { z } from 'zod';
import { COUPON_KIND, COUPON_CODE_PATTERN } from '@shop/core';

/**
 * 쿠폰 발행 계약.
 *
 * 값의 **조합**이 말이 되는지는 core 의 validateCouponDefinition 이 본다.
 * 여기서는 형식만 본다 — 정액인데 상한을 넣었다 같은 판단은 정책이지
 * 계약이 아니다.
 */
/**
 * 쿠폰이 붙는 대상.
 *
 * 비워 두면 장바구니 전체. 지정하면 그 줄에만 붙고 **최소 주문 금액도
 * 그 줄들의 합계로 잰다** — 전체로 재면 대상 아닌 상품으로 채울 수 있다.
 */
export const couponTargetSchema = z.object({
  targetType: z.enum(['PRODUCT', 'BRAND', 'CATEGORY']),
  targetId: z.string().min(1).max(40),
});
export type CouponTargetInput = z.infer<typeof couponTargetSchema>;

export const createCouponSchema = z.object({
  code: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase().replace(/[\s-]/g, ''))
    .refine((v) => COUPON_CODE_PATTERN.test(v), '코드는 영문·숫자 4~20자입니다'),
  name: z.string().trim().min(1, '쿠폰 이름을 입력해 주세요').max(60),
  kind: z.enum(COUPON_KIND),
  value: z.number().int().min(0).max(10_000_000).default(0),
  percent: z.number().int().min(0).max(100).default(0),
  maxDiscount: z.number().int().min(0).max(10_000_000).nullable().default(null),
  minimumOrder: z.number().int().min(0).max(10_000_000).default(0),
  issueLimit: z.number().int().min(0).max(1_000_000).nullable().default(null),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  targets: z.array(couponTargetSchema).max(200).default([]),
});
export type CreateCouponInput = z.infer<typeof createCouponSchema>;

/**
 * 수정.
 *
 * **할인 내용은 없다.** 한 장이라도 발급되면 못 고치고, 발급 전이라면
 * 지우고 다시 만드는 편이 명확하다. 이름·종료일·중지만 연다.
 */
export const updateCouponSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  endsAt: z.string().datetime({ offset: true }).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateCouponInput = z.infer<typeof updateCouponSchema>;

/** 코드로 직접 받기 */
export const claimCouponSchema = z.object({
  code: z.string().trim().min(1, '쿠폰 코드를 입력해 주세요').max(30),
});

/** 어드민이 여러 사용자에게 지급 */
export const issueCouponSchema = z.object({
  userIds: z.array(z.string()).min(1, '지급할 회원을 골라 주세요').max(500),
});
