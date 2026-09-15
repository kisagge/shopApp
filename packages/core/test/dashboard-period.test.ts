import { describe, it, expect } from 'vitest';
import { presetPeriod, customPeriod, previousPeriod, compareValues, DASHBOARD_MAX_DAYS } from '../src';

/** 대시보드 기간과 비교할 지난 기간 */
// KST 2026-09-15 10:00
const NOW = new Date('2026-09-15T01:00:00Z');
const kst = (iso: string) => new Date(`${iso}+09:00`);

describe('presetPeriod', () => {
  it('7일은 오늘 포함 7일, 끝은 내일 KST 자정(미포함)', () => {
    const p = presetPeriod('7d', NOW);
    expect(p.from).toEqual(kst('2026-09-09T00:00:00'));
    expect(p.until).toEqual(kst('2026-09-16T00:00:00'));
    expect(p).toMatchObject({ days: 7, preset: '7d', fromDay: '2026-09-09', toDay: '2026-09-15' });
  });
});

describe('customPeriod', () => {
  it('KST 날짜로 자르고 끝날을 포함한다', () => {
    const r = customPeriod('2026-09-01', '2026-09-07', NOW);
    expect(r).toMatchObject({ ok: true, period: { from: kst('2026-09-01T00:00:00'), until: kst('2026-09-08T00:00:00'), days: 7, preset: null } });
  });

  it('거꾸로 된 기간·오늘 이후·없는 날짜·형식 오류는 이유와 함께 거절한다', () => {
    expect(customPeriod('2026-09-07', '2026-09-01', NOW)).toEqual({ ok: false, message: '시작일이 종료일보다 뒤입니다.' });
    expect(customPeriod('2026-09-10', '2026-09-16', NOW)).toEqual({ ok: false, message: '오늘 이후는 고를 수 없습니다.' });
    expect(customPeriod('2026-02-30', '2026-03-02', NOW)).toEqual({ ok: false, message: '날짜를 읽을 수 없습니다.' });
    expect(customPeriod('9/1', '2026-09-02', NOW)).toEqual({ ok: false, message: '날짜를 읽을 수 없습니다.' });
  });

  it(`${DASHBOARD_MAX_DAYS}일까지, 최근 ${DASHBOARD_MAX_DAYS}일 안에서만 — 지워진 날의 트래픽이 0 으로 잡히지 않게`, () => {
    // 오늘 포함 90일: 6/18 ~ 9/15
    expect(customPeriod('2026-06-18', '2026-09-15', NOW).ok).toBe(true);
    expect(customPeriod('2026-06-17', '2026-09-15', NOW)).toEqual({ ok: false, message: '기간은 90일까지 고를 수 있습니다.' });
    expect(customPeriod('2026-06-17', '2026-06-20', NOW)).toEqual({ ok: false, message: '최근 90일 안에서 고를 수 있습니다.' });
  });
});

describe('previousPeriod', () => {
  it('지난 기간은 같은 길이로 바로 앞이다', () => {
    const r = customPeriod('2026-09-08', '2026-09-14', NOW);
    if (!r.ok) throw new Error(r.message);
    expect(previousPeriod(r.period, NOW)).toEqual({ from: kst('2026-09-01T00:00:00'), until: kst('2026-09-08T00:00:00') });
  });

  it('오늘이 들어간 기간은 지금 시각까지만 비교한다 — 오늘 10시를 어제 온종일과 견주지 않는다', () => {
    const today = presetPeriod('1d', NOW);
    expect(previousPeriod(today, NOW)).toEqual({ from: kst('2026-09-14T00:00:00'), until: kst('2026-09-14T10:00:00') });

    const week = presetPeriod('7d', NOW);
    // 이번 기간은 9/9 00:00 부터 6일 10시간이 흘렀다 → 지난 기간도 9/2 00:00 부터 6일 10시간
    expect(previousPeriod(week, NOW)).toEqual({ from: kst('2026-09-02T00:00:00'), until: kst('2026-09-08T10:00:00') });
  });
});

describe('compareValues', () => {
  it('변화량·퍼센트(소수 첫째)·방향', () => {
    expect(compareValues(120, 100)).toEqual({ change: 20, percent: 20, direction: 'up' });
    expect(compareValues(2, 3)).toEqual({ change: -1, percent: -33.3, direction: 'down' });
    expect(compareValues(5, 5)).toEqual({ change: 0, percent: 0, direction: 'flat' });
  });

  it('지난 기간이 0 이면 퍼센트는 없다 — 0 에서 늘어난 것은 몇 %라 말할 수 없다', () => {
    expect(compareValues(10, 0)).toEqual({ change: 10, percent: null, direction: 'up' });
  });

  it('지난 기간이 음수(환불이 더 많았음)여도 방향이 뒤집히지 않는다', () => {
    expect(compareValues(-50, -100)).toEqual({ change: 50, percent: 50, direction: 'up' });
  });
});
