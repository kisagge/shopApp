import { describe, it, expect } from 'vitest';
import {
  rateVital, p75, formatVital, VITAL_THRESHOLD, WEB_VITAL, isWebVital,
  vitalsWindow, VITALS_WINDOW_DAYS, DEFAULT_VITALS_WINDOW,
  enoughSamples, VITALS_MIN_SAMPLES,
} from '../src/web-vitals';

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

/**
 * **보는 구간은 주소가 정하고, 주소는 누구나 적어 보낸다.**
 *
 * 이 수는 거른 뒤 그대로 질의의 구간이 된다 — `?days=100000` 한 줄이 이벤트 표를
 * 통째로 훑게 하는 길이 되지 않도록, 목록에 없는 것은 전부 기본값으로 돌린다.
 */
describe('보는 구간', () => {
  it.each(VITALS_WINDOW_DAYS)('목록에 있는 %i 일은 그대로 쓴다', (days) => {
    expect(vitalsWindow(String(days))).toBe(days);
  });

  /*
   * 목록 **밖**의 수는 생김새가 멀쩡해도 돌려보낸다. 14 는 그럴듯해 보이지만
   * 고르개에 없는 값이라, 받아 주면 화면의 "지금 보는 구간" 과 실제가 갈린다.
   */
  it.each([
    ['없는 수', '14'],
    ['아주 큰 수 — 표를 통째로 훑게 하는 길', '100000'],
    ['음수', '-7'],
    ['0 — 아무 구간도 아니다', '0'],
    ['소수', '7.5'],
    ['숫자가 아닌 것', 'all'],
    ['빈 문자열 — Number 가 0 으로 바꾼다', ''],
    ['공백만', '   '],
    ['질의에 섞인 SQL', "28; drop table event_logs"],
    ['안 적음', undefined],
  ])('%s 은 기본값으로 돌린다', (_why, raw) => {
    expect(vitalsWindow(raw)).toBe(DEFAULT_VITALS_WINDOW);
  });

  /*
   * 주소 표는 같은 이름이 두 번 오면 배열을 준다. 손으로 고쳐 붙인 사람이
   * 뜻한 것은 나중에 적은 쪽이다.
   */
  it('같은 이름이 두 번 오면 마지막 것을 쓴다', () => {
    expect(vitalsWindow(['1', '7'])).toBe(7);
    expect(vitalsWindow(['7', 'all'])).toBe(DEFAULT_VITALS_WINDOW);
    expect(vitalsWindow([])).toBe(DEFAULT_VITALS_WINDOW);
  });

  it('기본값은 고르개에 실제로 있는 값이다 — 없으면 아무 칸도 지금 구간으로 안 보인다', () => {
    expect(VITALS_WINDOW_DAYS).toContain(DEFAULT_VITALS_WINDOW);
  });

  /*
   * **기본은 구글과 같은 28일이다.** 이 값을 줄이면 화면의 판정이 구글 보고서와
   * 달라지고, 두 수가 다른 까닭을 아무도 설명할 수 없게 된다.
   */
  it('기본은 구글이 Core Web Vitals 를 판정하는 28일이다', () => {
    expect(DEFAULT_VITALS_WINDOW).toBe(28);
  });

  it('고르개는 짧은 쪽부터 — 표의 차례가 곧 이 목록이다', () => {
    expect([...VITALS_WINDOW_DAYS]).toEqual([...VITALS_WINDOW_DAYS].toSorted((a, b) => a - b));
  });

  /** 배포 직후를 볼 칸이 없으면 이 고르개는 있으나 마나다 */
  it('하루짜리 칸이 있다 — 방금 내보낸 것을 보는 자리', () => {
    expect(VITALS_WINDOW_DAYS).toContain(1);
  });
});

/**
 * **표본이 모자란 값에는 판정을 내리지 않는다.**
 *
 * 75 백분위는 표본이 적으면 "둘째로 느린 값" 과 다르지 않다. 표본 하나로 잰 CLS 0.283 에
 * 빨간 "나쁨" 이 붙어 있었고, 그것은 읽는 사람을 **한 사람이 한 번 겪은 일**로 보내는 길이다.
 */
describe('판정을 내릴 만한 표본', () => {
  it.each([
    [0, false],
    [1, false],
    [VITALS_MIN_SAMPLES - 1, false],
    [VITALS_MIN_SAMPLES, true],
    [VITALS_MIN_SAMPLES + 1, true],
    [1000, true],
  ])('표본 %i → %s', (samples, expected) => {
    expect(enoughSamples(samples)).toBe(expected);
  });

  /** 경계가 "이상" 인지 "초과" 인지로 한 칸이 갈린다 — 그 한 칸이 화면의 빨간 글씨다 */
  it('문턱 그 수는 들어간다 — 초과가 아니라 이상이다', () => {
    expect(enoughSamples(VITALS_MIN_SAMPLES)).toBe(true);
  });

  it('문턱은 1보다 크다 — 1이면 아무것도 거르지 못한다', () => {
    expect(VITALS_MIN_SAMPLES).toBeGreaterThan(1);
  });
});
