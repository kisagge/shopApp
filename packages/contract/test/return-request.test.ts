import { describe, it, expect } from 'vitest';
import { returnRequestSchema, resolveReturnSchema } from '../src';

/** 반품·교환 계약 — 교환은 바꿀 옵션 없이 받지 않는다 */
describe('returnRequestSchema', () => {
  it('교환인데 바꿀 옵션이 없으면 그 칸에 우리 말로 거절한다', () => {
    const r = returnRequestSchema.safeParse({ type: 'EXCHANGE', reason: 'DEFECT' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]).toMatchObject({ path: ['exchanges'], message: 'valid.exchangeOptionRequired' });
    expect(returnRequestSchema.safeParse({ type: 'EXCHANGE', reason: 'DEFECT', exchanges: [] }).success).toBe(false);
  });

  it('교환에 옵션이 있으면, 반품은 옵션 없이 받는다', () => {
    expect(returnRequestSchema.safeParse({ type: 'EXCHANGE', reason: 'DEFECT', exchanges: [{ itemId: 'i', variantId: 'v' }] }).success).toBe(true);
    expect(returnRequestSchema.safeParse({ type: 'RETURN', reason: 'DEFECT' }).success).toBe(true);
  });
});

describe('resolveReturnSchema — 교환 상품 발송', () => {
  it('택배사와 숫자 9~20자리 송장을 받는다(하이픈 허용)', () => {
    expect(resolveReturnSchema.safeParse({ action: 'SHIP_EXCHANGE', carrier: 'CJ', trackingNumber: '1234-5678-9012' }).success).toBe(true);
    expect(resolveReturnSchema.safeParse({ action: 'SHIP_EXCHANGE', carrier: 'CJ', trackingNumber: '1234' }).success).toBe(false);
    expect(resolveReturnSchema.safeParse({ action: 'SHIP_EXCHANGE', carrier: 'DHL', trackingNumber: '123456789012' }).success).toBe(false);
  });
});
