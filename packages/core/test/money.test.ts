import { describe, it, expect } from 'vitest';
import { won, add, subtractToZero, multiply, percentOf, discountRateOf, format, formatWithUnit, MoneyError } from '../src/money';

describe('won', () => {
  it('정수만 허용한다', () => {
    expect(() => won(1000.5)).toThrow(MoneyError);
    expect(() => won(Number.NaN)).toThrow(MoneyError);
    expect(() => won(Number.POSITIVE_INFINITY)).toThrow(MoneyError);
    expect(won(1000)).toBe(1000);
  });
});

describe('percentOf', () => {
  it('원 단위 미만은 버린다', () => {
    // 413,000의 30%는 123,900 — 딱 떨어지지만
    expect(percentOf(won(413_000), 30)).toBe(123_900);
    // 33,333의 15%는 4,999.95 → 4,999
    expect(percentOf(won(33_333), 15)).toBe(4_999);
  });

  it('0%와 100%를 처리한다', () => {
    expect(percentOf(won(10_000), 0)).toBe(0);
    expect(percentOf(won(10_000), 100)).toBe(10_000);
  });

  it('범위를 벗어난 할인율을 거부한다', () => {
    expect(() => percentOf(won(1000), -1)).toThrow(MoneyError);
    expect(() => percentOf(won(1000), 101)).toThrow(MoneyError);
  });
});

describe('subtractToZero', () => {
  it('음수로 내려가지 않는다', () => {
    expect(subtractToZero(won(5_000), won(8_000))).toBe(0);
    expect(subtractToZero(won(8_000), won(5_000))).toBe(3_000);
  });
});

describe('multiply', () => {
  it('수량이 음수거나 소수면 거부한다', () => {
    expect(() => multiply(won(1000), -1)).toThrow(MoneyError);
    expect(() => multiply(won(1000), 1.5)).toThrow(MoneyError);
  });
});

describe('discountRateOf — 판매가에서 표시 할인율을 만든다', () => {
  it('시안의 코트: 413,000 → 289,000 은 30%', () => {
    expect(discountRateOf(won(413_000), won(289_000))).toBe(30);
  });

  it('내림한다 — 29.98%를 30%로 올려 표시하면 과장이다', () => {
    // 100,000 → 70,010 은 29.99%
    expect(discountRateOf(won(100_000), won(70_010))).toBe(29);
  });

  it('할인이 없으면 0이다', () => {
    expect(discountRateOf(won(129_000), won(129_000))).toBe(0);
  });

  it('판매가가 정가보다 크면 0으로 둔다 — 음수 할인율을 만들지 않는다', () => {
    expect(discountRateOf(won(100_000), won(120_000))).toBe(0);
  });

  it('정가가 0이면 0으로 나누지 않는다', () => {
    expect(discountRateOf(won(0), won(0))).toBe(0);
  });

  it('전액 할인은 100%', () => {
    expect(discountRateOf(won(50_000), won(0))).toBe(100);
  });
});

describe('format', () => {
  it('한국식 천단위 구분자를 쓴다', () => {
    expect(format(won(289_000))).toBe('289,000');
    expect(formatWithUnit(won(289_000))).toBe('289,000원');
  });
});

describe('add', () => {
  it('인자가 없으면 0이다', () => {
    expect(add()).toBe(0);
  });
});
