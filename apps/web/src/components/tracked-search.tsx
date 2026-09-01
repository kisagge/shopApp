'use client';

import { useEffect, useRef } from 'react';
import { track } from '~/lib/analytics/client';

/**
 * 검색 이벤트.
 *
 * 결과 수까지 함께 남긴다. **0건 검색이 무엇이었는지가 가장 값진 신호**다 —
 * 찾는데 없는 물건이거나, 우리 검색이 못 찾는 물건이거나 둘 중 하나다.
 */
export function TrackedSearch({ term, resultCount }: { term: string; resultCount: number }) {
  const sent = useRef<string | null>(null);

  useEffect(() => {
    const key = `${term}:${resultCount}`;
    if (sent.current === key) return;
    sent.current = key;
    track('search', { query: term, resultCount });
  }, [term, resultCount]);

  return null;
}
