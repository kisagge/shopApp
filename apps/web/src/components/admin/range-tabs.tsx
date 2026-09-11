import Link from 'next/link';
import { DASHBOARD_RANGE, DASHBOARD_RANGE_LABEL, type DashboardRange } from '@shop/core';

/**
 * 대시보드 기간 선택.
 *
 * 링크로 만든다. 자바스크립트 없이 동작하고, 고른 기간이 주소에 남아
 * 새로고침·뒤로가기·공유가 그대로 된다 — 검색·필터와 같은 방식이다.
 *
 * 지금 보고 있는 것은 링크가 아니라 텍스트로 둔다. 자기 자신으로 가는 링크는
 * 눌러도 아무 일이 없어서 스크린리더 사용자에게 특히 혼란스럽다.
 * aria-current 로 어느 것이 지금인지 함께 알린다.
 */
export function RangeTabs({ current }: { current: DashboardRange }) {
  return (
    <nav aria-label="집계 기간">
      <ul className="flex items-center gap-1 rounded-md border border-[var(--border)] p-0.5">
        {DASHBOARD_RANGE.map((range) => {
          const active = range === current;
          const label = DASHBOARD_RANGE_LABEL[range];
          return (
            <li key={range}>
              {active ? (
                <span
                  aria-current="true"
                  className="block rounded-sm bg-[var(--brand)] px-3 py-1 text-xs font-medium text-[var(--bg)]"
                >
                  {label}
                </span>
              ) : (
                <Link
                  href={`/admin?range=${range}`}
                  className="block rounded-sm px-3 py-1 text-xs font-medium text-[var(--fg-secondary)] no-underline hover:bg-[var(--surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
                >
                  {label}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
