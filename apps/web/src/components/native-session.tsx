'use client';

import { useEffect } from 'react';
import { hydrateSessionToken, isNativeShell } from '@shop/native';

/**
 * 네이티브 셸에서 저장해 둔 세션 토큰을 메모리로 올린다.
 *
 * 앱이 뜰 때 한 번만 한다. 이것이 없으면 웹뷰가 쿠키를 잃었을 때 토큰이
 * 저장소에 남아 있어도 아무도 꺼내 쓰지 않아, 켤 때마다 로그인하게 된다.
 *
 * 브라우저에서는 아무 일도 하지 않는다 — 웹은 쿠키로 붙는다.
 * 화면을 그리지 않으므로 하이드레이션에 영향도 없다.
 */
export function NativeSession() {
  useEffect(() => {
    if (!isNativeShell()) return;
    void hydrateSessionToken();
  }, []);

  return null;
}
