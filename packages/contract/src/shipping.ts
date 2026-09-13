import { z } from 'zod';

/**
 * 배송비 정책 수정.
 *
 * **값만 받는다. 규칙은 코드에 있다.** "무료 기준을 넘으면 기본료를 받지
 * 않는다" 까지 데이터로 만들면 아무도 그 동작을 읽을 수 없게 된다.
 *
 * 상한을 두는 이유는 **0 하나가 더 붙는 실수**다. 30,000 을 300,000 으로
 * 적으면 화면은 멀쩡히 그려지고, 그 배송비를 치른 사람이 문의를 넣기 전까지
 * 아무도 모른다.
 */
export const updateShippingPolicySchema = z
  .object({
    baseFee: z.int().min(0, 'valid.tooSmall').max(100_000, 'valid.tooBig'),
    /**
     * 무료배송을 안 하는 가게도 있다 — null 은 잘못된 값이 아니라 뜻이 있는
     * 값이다. 빈 칸으로 두면 "무료배송 없음" 이다.
     */
    freeThreshold: z.int().min(0, 'valid.tooSmall').max(10_000_000, 'valid.tooBig').nullable(),
    remoteSurcharge: z.int().min(0, 'valid.tooSmall').max(100_000, 'valid.tooBig'),
  })
  .refine((v) => v.freeThreshold === null || v.freeThreshold > v.baseFee, {
    /*
     * **무료 기준이 기본료보다 낮으면 뜻이 뒤집힌다.** 3,000원짜리 배송비에
     * 무료 기준이 2,000원이면 사실상 언제나 무료인데, 화면에는 "2,000원 이상
     * 무료배송" 이라고 적힌다 — 읽는 사람은 조건이 있는 줄 안다.
     */
    message: 'valid.freeThresholdTooLow',
    path: ['freeThreshold'],
  });
export type UpdateShippingPolicyInput = z.infer<typeof updateShippingPolicySchema>;
