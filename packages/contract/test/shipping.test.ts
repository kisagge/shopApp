import { describe, it, expect } from 'vitest';
import { updateShippingPolicySchema } from '../src';

/**
 * 배송 정책 계약.
 *
 * **무료 기준이 기본료보다 낮으면 뜻이 뒤집힌다.** 3,000원짜리 배송비에 무료 기준이
 * 2,000원이면 사실상 언제나 무료인데, 화면에는 "2,000원 이상 무료배송" 이라고 적힌다 —
 * 읽는 사람은 조건이 있는 줄 안다. 그 규칙을 보는 `.refine()` 이 한 번도 안 돌았다.
 */
describe('무료배송 기준', () => {
  const base = { baseFee: 3000, remoteSurcharge: 3000 };

  it('기본료보다 높아야 받는다', () => {
    expect(updateShippingPolicySchema.safeParse({ ...base, freeThreshold: 30_000 }).success).toBe(true);
  });

  it.each([
    ['기본료와 같으면', 3000],
    ['기본료보다 낮으면', 2000],
    ['0 이면', 0],
  ])('%s 받지 않는다', (_label, freeThreshold) => {
    const r = updateShippingPolicySchema.safeParse({ ...base, freeThreshold });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('valid.freeThresholdTooLow');
    expect(r.error?.issues[0]?.path).toEqual(['freeThreshold']);
  });

  it('한 원만 높아도 받는다 — 위의 거절이 한 칸 넓지 않은지', () => {
    expect(updateShippingPolicySchema.safeParse({ ...base, freeThreshold: 3001 }).success).toBe(true);
  });

  /**
   * **무료배송을 안 하는 가게도 있다.** `null` 은 잘못된 값이 아니라 뜻이 있는 값이다 —
   * "무료배송 없음". 거절하면 그 가게는 정책을 저장할 수 없다.
   */
  it('무료배송을 안 하면 비워 둔다', () => {
    expect(updateShippingPolicySchema.safeParse({ ...base, freeThreshold: null }).success).toBe(true);
  });

  it('기본료가 0 이면 기준은 1원부터다 — 공짜 배송에도 기준은 적을 수 있다', () => {
    expect(updateShippingPolicySchema.safeParse({ baseFee: 0, remoteSurcharge: 0, freeThreshold: 1 }).success).toBe(true);
    expect(updateShippingPolicySchema.safeParse({ baseFee: 0, remoteSurcharge: 0, freeThreshold: 0 }).success).toBe(false);
  });
});
