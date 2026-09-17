import { describe, it, expect } from 'vitest';
import { settlementHoldSchema } from '../src';

/**
 * 정산 지급 보류·해제. 보류는 까닭을 적어야 한다 — 가맹점도 그 까닭을 본다.
 */
describe('정산 지급 보류', () => {
  it('보류는 까닭과 함께 받고, 앞뒤 공백을 지운다', () => {
    expect(settlementHoldSchema.parse({ hold: true, reason: '  계좌 확인 중 ' })).toEqual({ hold: true, reason: '계좌 확인 중' });
  });

  it('까닭 없는 보류는 받지 않는다', () => {
    const empty = settlementHoldSchema.safeParse({ hold: true, reason: '   ' });
    expect(empty.success).toBe(false);
    expect(empty.error?.issues[0]?.message).toBe('valid.tooShortChars');
    expect(settlementHoldSchema.safeParse({ hold: true }).success).toBe(false);
  });

  it('까닭이 너무 길면 받지 않는다', () => {
    expect(settlementHoldSchema.safeParse({ hold: true, reason: '가'.repeat(201) }).success).toBe(false);
  });

  it('푸는 것은 까닭이 없어도 된다 — 보내도 버린다', () => {
    expect(settlementHoldSchema.parse({ hold: false })).toEqual({ hold: false });
    expect(settlementHoldSchema.parse({ hold: false, reason: 'x' })).toEqual({ hold: false });
  });

  it('보류인지 해제인지 모르면 받지 않는다', () => {
    expect(settlementHoldSchema.safeParse({ reason: 'x' }).success).toBe(false);
    expect(settlementHoldSchema.safeParse({ hold: 'yes', reason: 'x' }).success).toBe(false);
  });
});
