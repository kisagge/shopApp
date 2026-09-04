import { describe, it, expect } from 'vitest';
import {
  formatMoney,
  moneyParts,
  formatNumber,
  formatDate,
  formatDateTime,
} from '../src/format';

describe('금액', () => {
  it('한국어는 원을 뒤에 붙인다', () => {
    expect(formatMoney('ko', 413_000)).toBe('413,000원');
  });

  it('다른 언어는 통화 기호를 앞에 붙인다', () => {
    // 원화 그대로다 — 환율은 다루지 않는다
    expect(formatMoney('en', 413_000)).toContain('413,000');
    expect(formatMoney('en', 413_000)).toContain('₩');
  });

  it('소수점을 만들지 않는다', () => {
    for (const l of ['ko', 'en', 'ja'] as const) {
      expect(formatMoney(l, 1), l).not.toContain('.');
    }
  });

  it('0원도 빈 문자열이 아니다', () => {
    expect(formatMoney('ko', 0)).toBe('0원');
  });
});

describe('숫자', () => {
  it('천 단위를 끊는다', () => {
    expect(formatNumber('ko', 1_234_567)).toBe('1,234,567');
  });
});

describe('날짜', () => {
  /** UTC 로는 3월 31일, 서울로는 4월 1일인 순간 */
  const edge = new Date('2026-03-31T15:30:00Z');

  it('서버 시간대와 무관하게 서울 기준으로 읽는다', () => {
    // 이 값이 브라우저 시간대를 따라가면 서버가 그린 것과 어긋나
    // 하이드레이션이 깨진다
    expect(formatDate('ko', edge)).toBe('2026. 4. 1.');
    expect(formatDateTime('ko', edge)).toContain('12:30');
  });

  it('언어마다 읽는 방식이 다르다', () => {
    expect(formatDate('en', edge)).toContain('Apr');
    expect(formatDate('ja', edge)).toBe('2026/04/01');
  });
});

describe('금액 쪼개기', () => {
  it('한국어는 단위를 뒤에 남긴다 — 화면이 작게 그린다', () => {
    expect(moneyParts('ko', 413_000)).toEqual({ prefix: '', number: '413,000', suffix: '원' });
  });

  it('다른 언어는 기호를 앞에 둔다', () => {
    expect(moneyParts('en', 413_000)).toEqual({ prefix: '₩', number: '413,000', suffix: '' });
  });

  it('붙여 놓으면 한 덩어리 서식과 같다', () => {
    // 두 길이 갈라지면 같은 값이 화면마다 다르게 보인다
    for (const l of ['ko', 'en', 'ja'] as const) {
      const p = moneyParts(l, 89_000);
      expect(`${p.prefix}${p.number}${p.suffix}`, l).toBe(formatMoney(l, 89_000));
    }
  });
});
