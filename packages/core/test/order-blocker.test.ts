import { describe, it, expect } from 'vitest';
import { orderBlocker, ORDER_BLOCKER } from '../src/order-blocker';

const ok = { lineCount: 2, brokenCount: 0, hasAddress: true, agreed: true };

describe('주문을 막는 것', () => {
  it('다 갖추면 막는 것이 없다', () => {
    expect(orderBlocker(ok)).toBeNull();
  });

  it('빈 주문서가 가장 먼저다 — 그 앞에서는 나머지를 말해도 소용없다', () => {
    expect(orderBlocker({ ...ok, lineCount: 0, hasAddress: false, agreed: false })).toBe('empty');
  });

  it('살 수 없는 줄이 배송지보다 먼저다', () => {
    expect(orderBlocker({ ...ok, brokenCount: 1, hasAddress: false })).toBe('broken');
  });

  it('배송지가 약관보다 먼저다 — 손대야 하는 차례가 그렇다', () => {
    expect(orderBlocker({ ...ok, hasAddress: false, agreed: false })).toBe('address');
  });

  it('나머지가 다 되면 약관만 남는다', () => {
    expect(orderBlocker({ ...ok, agreed: false })).toBe('agree');
  });

  /** 이유를 늘리면 사전에도 말이 있어야 한다 — apps/web 쪽 검사가 그것을 본다 */
  it('이유 목록과 판정이 어긋나지 않는다', () => {
    const cases = [
      { ...ok, lineCount: 0 },
      { ...ok, brokenCount: 1 },
      { ...ok, hasAddress: false },
      { ...ok, agreed: false },
    ];
    const seen = cases.map((c) => orderBlocker(c));
    expect(new Set(seen)).toEqual(new Set(ORDER_BLOCKER));
  });
});
