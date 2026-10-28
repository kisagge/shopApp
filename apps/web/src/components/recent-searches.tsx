'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRecentSearches } from '~/stores/recent-searches';
import { useT } from '~/lib/i18n/client';

/** 한 번에 그릴 최대 개수. 들고 있는 것보다 적게 보여도 된다. */
const SHOWN = 8;

/**
 * 최근 검색어 칩.
 *
 * **찾은 것이 없으면 아무것도 그리지 않는다.** 빈 상자에 "아직 없습니다" 를 띄우면 처음 온 사람에게는
 * 화면만 길어진다(최근 본 상품과 같은 판단).
 *
 * **줄마다 지우는 길을 둔다.** 검색어에는 사적인 것이 섞이기 쉬워서(증상·선물 받을 사람) 하나만 지우고
 * 나머지는 남기고 싶은 것이 자연스럽다. 전부 지우기만 두면 그 사람은 전부 지우거나 전부 남긴다.
 *
 * 칩은 **링크와 단추 둘**이다. 하나로 묶어 `role="option"` 같은 것으로 만들면 지우는 단추가 그 안에
 * 들어가고, 그러면 이름이 "코트 지우기" 가 되어 낭독기가 검색어마다 "지우기" 를 덧붙여 읽는다 —
 * 가입 동의에서 읽기 링크를 이름표 밖으로 뺀 것과 같은 까닭이다.
 */
export function RecentSearches() {
  const terms = useRecentSearches((s) => s.terms);
  const remove = useRecentSearches((s) => s.remove);
  const clear = useRecentSearches((s) => s.clear);
  const t = useT();

  /**
   * localStorage 는 서버에 없다. 첫 렌더를 비워 두고 그다음에 채운다 — 그러지 않으면 하이드레이션이
   * 어긋난다(최근 본 상품·장바구니 개수와 같은 이유).
   */
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  /**
   * 지웠다고 알리기 위한 상태.
   *
   * 칩이 사라지는 것은 **눈으로만 보인다** — 낭독기로 듣는 사람에게는 단추를 눌렀는데 아무 일도
   * 일어나지 않은 것과 같다. 마지막 줄을 지우면 이 묶음이 통째로 사라지므로 더욱 그렇다.
   */
  const [said, setSaid] = useState('');

  const shown = terms.slice(0, SHOWN);

  return (
    <>
      {/*
        알림 자리는 **늘 DOM 에 둔다.** 지우는 순간 함께 만들어 넣으면 낭독기가 그 글을 놓치는 경우가
        있다. 서버와 첫 렌더에서는 비어 있으므로 하이드레이션도 어긋나지 않는다.
      */}
      <p role="status" className="sr-only">
        {said}
      </p>

      {mounted && shown.length > 0 && (
        <nav aria-label={t('recentSearch.heading')} className="mt-8">
          <div className="flex items-baseline justify-center gap-3">
            <h2 className="text-[11px] font-medium tracking-[0.08em] text-[var(--fg-muted)]">
              {t('recentSearch.heading')}
            </h2>
            <button
              /* 이 상자는 검색 폼 밖에 있지만, 기본값(submit)에 기대지 않는다 */
              type="button"
              onClick={() => {
                clear();
                setSaid(t('recentSearch.cleared'));
              }}
              className="h-7 shrink-0 text-[11px] text-[var(--fg-muted)] underline underline-offset-2 hover:text-[var(--fg)]"
            >
              {t('recentSearch.clearAll')}
            </button>
          </div>

          <ul className="mt-3 flex flex-wrap justify-center gap-2">
            {shown.map((term) => (
              <li key={term} className="flex items-center rounded-full border border-[var(--border-strong)]">
                <Link
                  href={{ pathname: '/search', query: { q: term } }}
                  className="inline-flex h-9 items-center rounded-l-full pr-1.5 pl-3.5 text-[13px] text-[var(--fg)] no-underline hover:bg-[var(--surface-2)]"
                >
                  {term}
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    remove(term);
                    setSaid(t('recentSearch.removed', { term }));
                  }}
                  /* 이름에 검색어를 넣는다 — "지우기" 가 여덟 개 있으면 어느 것인지 알 수 없다 */
                  aria-label={t('recentSearch.remove', { term })}
                  className="inline-flex h-9 items-center rounded-r-full pr-2.5 pl-1 text-[var(--fg-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]"
                >
                  <span aria-hidden="true" className="text-[13px] leading-none">
                    ×
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {/* 어디에 남는 기록인지 밝힌다. 검색 기록은 밝히지 않으면 불쾌한 종류다. */}
          <p className="mt-3 text-[11px] text-[var(--fg-muted)]">{t('recentSearch.note')}</p>
        </nav>
      )}
    </>
  );
}
