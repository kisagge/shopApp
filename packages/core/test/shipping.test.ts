import { describe, it, expect } from 'vitest';
import { won } from '../src/money';
import { calculateShipping, DEFAULT_SHIPPING } from '../src/shipping';

describe('calculateShipping', () => {
  it('임계값 미만이면 기본 배송비를 매긴다', () => {
    const r = calculateShipping({ merchandiseTotal: won(49_999), isRemoteArea: false });
    expect(r.fee).toBe(3_000);
    expect(r.isFree).toBe(false);
    expect(r.remainingForFree).toBe(1);
  });

  it('임계값과 같으면 무료다 (경계 포함)', () => {
    const r = calculateShipping({ merchandiseTotal: won(50_000), isRemoteArea: false });
    expect(r.fee).toBe(0);
    expect(r.isFree).toBe(true);
    expect(r.remainingForFree).toBe(0);
  });

  it('도서산간 추가비는 무료배송이어도 청구한다', () => {
    const r = calculateShipping({ merchandiseTotal: won(100_000), isRemoteArea: true });
    expect(r.isFree).toBe(true);
    expect(r.surcharge).toBe(3_000);
    expect(r.fee).toBe(3_000);
  });

  it('무료배송 정책이 없으면 항상 배송비를 매긴다', () => {
    const r = calculateShipping({
      merchandiseTotal: won(1_000_000),
      isRemoteArea: false,
      policy: { ...DEFAULT_SHIPPING, freeThreshold: null },
    });
    expect(r.fee).toBe(3_000);
    expect(r.remainingForFree).toBe(0);
  });
});
