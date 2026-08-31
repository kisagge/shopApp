'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { getTracker } from '~/lib/analytics/client';

/**
 * 페이지 이동을 기록하고, 페이지를 떠날 때 큐를 비운다.
 *
 * App Router 는 클라이언트 내비게이션이라 브라우저 기본 페이지뷰가 잡히지 않는다.
 * usePathname 변화로 직접 찍는다.
 */
export function AnalyticsProvider({ consent }: { consent?: boolean }) {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (consent === undefined) return;
    // 로그인 사용자의 계정 설정이 로컬 값보다 우선한다
    if (!consent) getTracker().flush();
  }, [consent]);

  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    getTracker().track('page_view');
  }, [pathname]);

  useEffect(() => {
    // 둘 다 듣는다. 하나만으로는 새는 경로가 있다.
    // - visibilitychange: 탭 전환·앱 전환. iOS 사파리는 여기서만 오는 경우가 있다.
    // - pagehide: 같은 탭에서 다른 문서로 이동(상품 카드가 <a> 라 전체 로드가 난다).
    //   이걸 빼먹으면 클릭 직후 이동하는 이벤트가 통째로 유실된다 — 실제로 겪었다.
    const flush = () => getTracker().flush(true);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
    };
  }, []);

  return null;
}
