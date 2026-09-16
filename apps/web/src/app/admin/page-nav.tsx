import Link from 'next/link';
import type { ComponentProps } from 'react';
import { pageNav } from '@shop/core';

/**
 * 쪽 번호 — « ‹ 1 2 3 4 5 › »
 *
 * **끝에 닿은 화살표는 링크가 아니다.** 눌러도 같은 자리로 오는 링크를 두면 낭독기는 갈 곳이 있는 것처럼 읽고,
 * 키보드 사용자는 탭 순서에 쓸모없는 정거장을 하나 더 만난다. 그래서 그때는 글자만 남긴다.
 *
 * **지금 쪽에는 `aria-current="page"` 를 붙인다.** 굵게만 그리면 그건 눈으로만 보이는 상태다.
 */
export function PageNav({
  page,
  total,
  pageSize,
  hrefOf,
  label = '쪽 이동',
}: {
  page: number;
  /** 조건에 맞는 전체 줄 수 */
  total: number;
  pageSize: number;
  /**
   * 쪽 번호로 주소를 만든다. 화면마다 조건(검색·필터)이 달라 부르는 쪽이 만든다.
   * `{ pathname, query }` 모양이라야 typedRoutes 가 받는다.
   */
  hrefOf: (page: number) => ComponentProps<typeof Link>['href'];
  label?: string;
}) {
  const nav = pageNav({ page, total, pageSize });
  // 한 쪽뿐이면 그릴 것이 없다 — 늘 같은 자리로 가는 번호 하나는 길이 아니다
  if (nav.totalPages <= 1) return null;

  const cell =
    'inline-flex h-9 min-w-9 items-center justify-center rounded-sm border px-2.5 text-[13px] no-underline';
  const idle = `${cell} border-[var(--border-strong)] text-[var(--fg)] hover:bg-[var(--surface-2)]`;
  const here = `${cell} border-[var(--fg)] bg-[var(--fg)] font-semibold text-[var(--bg)]`;
  const dead = `${cell} border-[var(--border)] text-[var(--fg-muted)]`;

  /** 화살표 한 칸. 갈 곳이 없으면 링크로 두지 않는다 */
  const arrow = (to: number, enabled: boolean, glyph: string, name: string) =>
    enabled ? (
      <Link href={hrefOf(to)} aria-label={name} className={idle}>
        <span aria-hidden="true">{glyph}</span>
      </Link>
    ) : (
      <span aria-hidden="true" className={dead}>{glyph}</span>
    );

  return (
    <nav aria-label={label} className="flex justify-center">
      <ul className="flex flex-wrap items-center gap-1.5">
        <li>{arrow(1, nav.hasPrev, '«', '첫 쪽')}</li>
        <li>{arrow(nav.page - 1, nav.hasPrev, '‹', '이전 쪽')}</li>

        {nav.pages.map((n) => (
          <li key={n}>
            {n === nav.page ? (
              /*
               * 지금 쪽은 링크로 두지 않는다. 같은 자리로 가는 링크이고, aria-current 만으로는
               * "누를 수 있는 것" 이라는 인상이 남는다.
               */
              <span aria-current="page" className={here}>
                {n}
              </span>
            ) : (
              <Link href={hrefOf(n)} aria-label={`${n}쪽`} className={idle}>
                {n}
              </Link>
            )}
          </li>
        ))}

        <li>{arrow(nav.page + 1, nav.hasNext, '›', '다음 쪽')}</li>
        <li>{arrow(nav.totalPages, nav.hasNext, '»', '마지막 쪽')}</li>
      </ul>
    </nav>
  );
}
