import { describe, it, expect } from 'vitest';
import { generateOrderNumber, isOrderNumber } from '../src/order-number';

describe('generateOrderNumber', () => {
  it('YYYYMMDD-NNNNNNN 형식이다', () => {
    const no = generateOrderNumber({ now: new Date('2026-08-31T05:00:00Z'), random: () => 0.8842713 });
    expect(no).toBe('20260831-8842713');
    expect(isOrderNumber(no)).toBe(true);
  });

  it('KST 기준 날짜를 쓴다 — UTC 로 찍으면 자정 직후 주문이 전날 번호를 단다', () => {
    // UTC 2026-08-30 15:30 = KST 2026-08-31 00:30
    const no = generateOrderNumber({ now: new Date('2026-08-30T15:30:00Z'), random: () => 0.1 });
    expect(no.startsWith('20260831')).toBe(true);
  });

  it('KST 자정 직전은 아직 전날이다', () => {
    // UTC 2026-08-30 14:30 = KST 2026-08-30 23:30
    const no = generateOrderNumber({ now: new Date('2026-08-30T14:30:00Z'), random: () => 0.1 });
    expect(no.startsWith('20260830')).toBe(true);
  });

  it('난수가 작아도 7자리를 채운다', () => {
    expect(generateOrderNumber({ now: new Date('2026-08-31T05:00:00Z'), random: () => 0 }))
      .toBe('20260831-0000000');
  });

  it('난수가 1에 가까워도 7자리를 넘지 않는다', () => {
    const no = generateOrderNumber({ now: new Date('2026-08-31T05:00:00Z'), random: () => 0.9999999 });
    expect(isOrderNumber(no)).toBe(true);
  });

  it('여러 번 뽑으면 대체로 다르다', () => {
    const set = new Set(Array.from({ length: 500 }, () => generateOrderNumber()));
    // 하루 1000만 조합에서 500개를 뽑으면 충돌은 사실상 없다
    expect(set.size).toBeGreaterThan(495);
  });
});

describe('isOrderNumber', () => {
  it.each([
    ['날짜가 짧다', '2026831-1234567'],
    ['접미가 짧다', '20260831-123456'],
    ['하이픈이 없다', '202608311234567'],
    ['문자가 섞였다', '20260831-12345AB'],
    ['빈 문자열', ''],
  ])('%s 는 거부한다', (_l, v) => {
    expect(isOrderNumber(v)).toBe(false);
  });
});
