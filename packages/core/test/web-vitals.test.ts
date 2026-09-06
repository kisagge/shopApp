import { describe, it, expect } from 'vitest';
import { rateVital, p75, formatVital, VITAL_THRESHOLD, WEB_VITAL, isWebVital } from '../src/web-vitals';

describe('좋고 나쁨의 기준', () => {
  it('구글이 정한 값을 그대로 쓴다 — 우리가 다시 정하면 남의 "좋은 LCP" 와 달라진다', () => {
    expect(VITAL_THRESHOLD.LCP).toEqual({ good: 2500, poor: 4000 });
    expect(VITAL_THRESHOLD.INP).toEqual({ good: 200, poor: 500 });
    expect(VITAL_THRESHOLD.CLS).toEqual({ good: 0.1, poor: 0.25 });
  });

  it.each([
    ['LCP', 2500, 'good'],
    ['LCP', 2501, 'needs-improvement'],
    ['LCP', 4000, 'needs-improvement'],
    ['LCP', 4001, 'poor'],
    ['CLS', 0.1, 'good'],
    ['CLS', 0.3, 'poor'],
  ] as const)('%s %s → %s', (metric, value, expected) => {
    expect(rateVital(metric, value)).toBe(expected);
  });

  it('경계값은 좋음에 넣는다 — 기준 "이하" 가 좋음이다', () => {
    for (const metric of WEB_VITAL) {
      expect(rateVital(metric, VITAL_THRESHOLD[metric].good)).toBe('good');
    }
  });

  it('모르는 이름은 걸러 낸다', () => {
    expect(isWebVital('LCP')).toBe(true);
    expect(isWebVital('FID')).toBe(false);
  });
});

describe('대표값', () => {
  it('느린 쪽이 넷 중 하나를 넘으면 대표값이 그쪽을 가리킨다', () => {
    // 둘은 0.1초, 둘은 5초. 평균은 2.55초로 어중간하지만 p75 는 5초를 가리킨다 —
    // 네 명 중 한 명이 그 화면을 봤다는 뜻이고, 그게 사실이다.
    expect(p75([100, 100, 5000, 5000])).toBe(5000);
  });

  it('느린 쪽이 넷 중 하나에 못 미치면 대표값에 잡히지 않는다', () => {
    // 이건 한계다. p75 는 "넷 중 셋이 이보다 빠르다" 를 말할 뿐,
    // 아주 드물게 아주 느린 사람을 대표하지 않는다.
    expect(p75([1000, 1000, 1000, 9000])).toBe(1000);
  });

  it('순서와 무관하다', () => {
    expect(p75([5000, 100, 5000, 100])).toBe(5000);
  });

  it('표본이 없으면 null — 0 을 주면 "아주 빠름" 으로 읽힌다', () => {
    expect(p75([])).toBeNull();
  });

  it('하나뿐이면 그 값이다', () => {
    expect(p75([1234])).toBe(1234);
  });

  it('보간하지 않는다 — 표본이 적을 때 없는 값이 대표가 된다', () => {
    // 보간하면 250 같은 값이 나오지만 실제로 그런 방문은 없었다
    expect([200, 300]).toContain(p75([100, 200, 300]));
  });
});

describe('화면에 쓸 모양', () => {
  it('CLS 만 소수다', () => {
    expect(formatVital('CLS', 0.1234)).toBe('0.123');
    expect(formatVital('LCP', 2500.7)).toBe('2501');
  });
});
