'use client';

import { useEffect } from 'react';
import { useRecentSearches } from '~/stores/recent-searches';

/**
 * 이 말로 찾았다고 기기에 적는다. 화면에는 아무것도 그리지 않는다.
 *
 * **검색창이 아니라 결과 화면이 적는다.** 창에서 적으면 그 창을 지나지 않은 검색은 안 남는다 — 인기 검색어
 * 칩, 자동완성의 브랜드 항목, 밖에서 들어온 링크가 모두 그렇다. 결과가 실제로 뜬 자리에서 적으면 들어온 길과
 * 무관하게 한 번만 남는다(최근 본 상품을 상품 화면이 적는 것과 같은 자리다).
 */
export function RecordRecentSearch({ term }: { term: string }) {
  const record = useRecentSearches((s) => s.record);

  useEffect(() => {
    record(term);
  }, [record, term]);

  return null;
}
