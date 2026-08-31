import { describe, it, expect } from 'vitest';
import { won, add, subtractToZero, multiply, percentOf, format, formatWithUnit, MoneyError } from '../src/money';

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
