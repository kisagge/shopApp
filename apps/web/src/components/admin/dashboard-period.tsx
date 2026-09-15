import { format, won, compareValues, dayKeyOf, DASHBOARD_MAX_DAYS } from '@shop/core';

export interface KpiCompare {
  readonly current: number;
  readonly previous: number;
  readonly unit: '원' | '건' | '%p';
  readonly previousLabel: string;
  /** 비율끼리의 비교 — 퍼센트 대신 차이(%p)만 적는다 */
  readonly points?: boolean;
}

/**
 * 지난 기간 대비.
 *
 * **방향을 글로 적는다** — 화살표와 색만으로는 못 보는 사람에게 늘었는지 줄었는지 전해지지 않는다. 늘어난 것이 늘 좋은
 * 것은 아니라(환불도 는다) 초록·빨강으로 좋고 나쁨을 칠하지 않고 방향만 적는다. 지난 기간이 0 이면 퍼센트 없이 차이만.
 */
export function Compare({ current, previous, unit, previousLabel, points }: KpiCompare) {
  const c = compareValues(current, previous);
  const amount = unit === '%p' ? `${Math.abs(Math.round(c.change * 10) / 10)}%p` : `${format(won(Math.abs(c.change)))}${unit}`;
  const word = c.direction === 'up' ? '증가' : c.direction === 'down' ? '감소' : '변화 없음';
  const arrow = c.direction === 'up' ? '▲' : c.direction === 'down' ? '▼' : '–';
  return (
    <p className="tnum text-[11px] text-[var(--fg-secondary)]">
      <span aria-hidden="true">{arrow} </span>
      {c.direction === 'flat'
        ? `지난 기간과 같음`
        : `지난 기간 대비 ${points || c.percent === null ? '' : `${Math.abs(c.percent)}% `}${word} (${c.direction === 'up' ? '+' : '−'}${amount})`}
      <span className="block text-[var(--fg-muted)]">지난 기간 {previousLabel}</span>
    </p>
  );
}

/**
 * 직접 고르는 기간. GET 폼이라 주소에 남아 새로 고침·공유가 된다(탭과 같다). 날짜 칸은 오늘과 90일 전으로 묶는다 —
 * 서버도 같은 규칙(core customPeriod)으로 다시 본다.
 */
export function CustomPeriodForm({ from, to, error, now }: { from: string; to: string; error: string | null; now: Date }) {
  const today = dayKeyOf(now);
  const earliest = dayKeyOf(new Date(now.getTime() - (DASHBOARD_MAX_DAYS - 1) * 24 * 60 * 60 * 1000));
  const field = 'h-8 rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-2 text-xs';
  return (
    <form method="get" action="/admin" aria-label="기간 직접 고르기" className="flex flex-wrap items-center gap-1.5">
      <label htmlFor="period-from" className="sr-only">시작일</label>
      <input
        id="period-from" name="from" type="date" defaultValue={from} min={earliest} max={today} required className={field}
        aria-invalid={error ? true : undefined} aria-describedby={error ? 'period-error' : undefined}
      />
      <span aria-hidden="true" className="text-xs text-[var(--fg-muted)]">~</span>
      <label htmlFor="period-to" className="sr-only">종료일</label>
      <input
        id="period-to" name="to" type="date" defaultValue={to} min={earliest} max={today} required className={field}
        aria-invalid={error ? true : undefined} aria-describedby={error ? 'period-error' : undefined}
      />
      <button type="submit" className="h-8 rounded-sm border border-[var(--border-strong)] px-2.5 text-xs font-medium">
        적용
      </button>
      {error && (
        <p id="period-error" role="alert" className="w-full text-xs text-accent">
          {error} 최근 7일을 보여 줍니다.
        </p>
      )}
    </form>
  );
}

