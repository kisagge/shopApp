import { dayKeyOf, dayWindow, rangeStart, DASHBOARD_RANGE_DAYS, type DashboardRange, type DayKey } from './event-rollup';

/**
 * 대시보드 집계 기간과 비교할 지난 기간. 순수 로직만.
 *
 * **숫자 하나로는 좋은지 나쁜지 모른다.** "이번 주 순매출 320만원" 은 지난주가 200만원이었는지 500만원이었는지에 따라
 * 뜻이 뒤집힌다. 그래서 같은 길이의 **바로 앞 기간**과 나란히 본다.
 *
 * 기간은 KST 달력으로 자르고 끝을 포함하지 않는다(`until` 미만). 직접 고른 기간은 90일까지 — 원본 이벤트 보존 기간과
 * 같아서, 더 길게 고르면 지워진 날의 트래픽이 조용히 0 으로 잡혀 전환율이 틀린다. 같은 이유로 90일보다 오래된 날에서
 * 시작할 수 없다.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
export const DASHBOARD_MAX_DAYS = 90;

export interface DashboardPeriod {
  /** 시작(포함) */
  readonly from: Date;
  /** 끝(포함하지 않음) — 마지막 날의 다음 날 KST 자정 */
  readonly until: Date;
  readonly days: number;
  /** 탭으로 고른 기간이면 그 값, 직접 고른 기간이면 null */
  readonly preset: DashboardRange | null;
  readonly fromDay: DayKey;
  readonly toDay: DayKey;
}

export function presetPeriod(range: DashboardRange, now: Date): DashboardPeriod {
  const from = rangeStart(range, now);
  const toDay = dayKeyOf(now);
  return { from, until: dayWindow(toDay).end, days: DASHBOARD_RANGE_DAYS[range], preset: range, fromDay: dayKeyOf(from), toDay };
}

export type CustomPeriodResult =
  | { readonly ok: true; readonly period: DashboardPeriod }
  | { readonly ok: false; readonly message: string };

export function customPeriod(fromDay: string, toDay: string, now: Date): CustomPeriodResult {
  let from: Date;
  let until: Date;
  try {
    from = dayWindow(fromDay).start;
    until = dayWindow(toDay).end;
  } catch {
    // 형식이 틀리거나 2월 30일처럼 없는 날(dayWindow 가 되읽어 거른다)
    return { ok: false, message: '날짜를 읽을 수 없습니다.' };
  }
  const today = dayWindow(dayKeyOf(now));
  if (from >= until) return { ok: false, message: '시작일이 종료일보다 뒤입니다.' };
  if (until > today.end) return { ok: false, message: '오늘 이후는 고를 수 없습니다.' };

  const days = Math.round((until.getTime() - from.getTime()) / DAY_MS);
  if (days > DASHBOARD_MAX_DAYS) return { ok: false, message: `기간은 ${DASHBOARD_MAX_DAYS}일까지 고를 수 있습니다.` };
  if (from.getTime() < today.start.getTime() - (DASHBOARD_MAX_DAYS - 1) * DAY_MS) {
    return { ok: false, message: `최근 ${DASHBOARD_MAX_DAYS}일 안에서 고를 수 있습니다.` };
  }
  return { ok: true, period: { from, until, days, preset: null, fromDay, toDay } };
}

/**
 * 비교할 지난 기간 — 같은 길이, 바로 앞.
 *
 * **오늘이 들어간 기간은 같은 시각까지만 비교한다.** 오늘 오전 10시에 "오늘" 을 보면 오늘은 10시간치인데 어제는 하루
 * 온종일이다 — 매일 아침 대시보드가 "어제보다 80% 줄었다" 고 말하게 된다. 그래서 지난 기간도 시작부터 지금까지 흐른
 * 시간만큼만 센다.
 */
export function previousPeriod(period: DashboardPeriod, now: Date): { readonly from: Date; readonly until: Date } {
  const from = new Date(period.from.getTime() - period.days * DAY_MS);
  const elapsed = Math.min(period.until.getTime(), now.getTime()) - period.from.getTime();
  return { from, until: new Date(from.getTime() + Math.max(0, elapsed)) };
}

export interface Comparison {
  /** 지금 − 지난 */
  readonly change: number;
  /** 지난 기간 대비 %, 소수 첫째 자리. 지난 기간이 0 이면 null — 0 에서 늘어난 것은 몇 %라 말할 수 없다 */
  readonly percent: number | null;
  readonly direction: 'up' | 'down' | 'flat';
}

export function compareValues(current: number, previous: number): Comparison {
  const change = current - previous;
  return {
    change,
    percent: previous === 0 ? null : Math.round((change / Math.abs(previous)) * 1000) / 10,
    direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
  };
}
