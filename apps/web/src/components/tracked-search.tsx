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
  /*
   * **이 가드는 지금 닿지 않는다.** 이펙트가 말과 결과 수에 매여 있어서, 같은
   * 값으로 다시 그리면 아예 다시 돌지 않는다(돌연변이로 없애 봐도 아무도 안
   * 졌다). 같은 조각이 이펙트를 두 번 돌리는 때를 위해 둔다 — 개발 모드의 두 번
   * 호출, 그리고 리액트가 상태를 들고 되살리는 길(ref 는 그때 살아남는다).
   * 검색 수가 두 배가 되면 "0건 검색" 신호가 그만큼 부풀어 읽을 수 없게 된다.
   */
  const sent = useRef<string | null>(null);

  useEffect(() => {
    const key = `${term}:${resultCount}`;
    if (sent.current === key) return;
    sent.current = key;
    track('search', { query: term, resultCount });
  }, [term, resultCount]);

  return null;
}
