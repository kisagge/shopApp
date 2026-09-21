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

/**
 * 승인한 신청을 무르는 길. 교환은 승인하는 순간 바꿀 옵션의 재고를 잡으므로, 끝내지 못한 신청을 그대로 두면
 * 그 재고가 묶인다. 반려와 마찬가지로 **까닭 없이는 못 한다** — 손님은 승인을 받고 기다리던 중이었다.
 */
describe('resolveReturnSchema — 승인 철회', () => {
  it('까닭을 적으면 통과한다', () => {
    expect(resolveReturnSchema.safeParse({ action: 'WITHDRAW', rejectReason: '물건이 오지 않았습니다' }).success).toBe(true);
  });

  it('까닭이 없으면 우리 말로 막는다', () => {
    const parsed = resolveReturnSchema.safeParse({ action: 'WITHDRAW' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0]?.message).toBe('valid.rejectReasonRequired');
  });

  it('공백만 적어도 막는다', () => {
    expect(resolveReturnSchema.safeParse({ action: 'WITHDRAW', rejectReason: '   ' }).success).toBe(false);
  });
});
