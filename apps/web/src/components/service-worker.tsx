'use client';

import { useEffect } from 'react';
import { isNativeShell } from '@shop/native';

/**
 * 서비스워커 등록.
 *
 * **네이티브 셸 안에서는 등록하지 않는다.** 셸에는 이미 자기 오프라인
 * 화면이 있어서(apps/mobile/www/index.html), 둘을 함께 두면 어느 쪽이
 * 뜨는지 상황마다 달라진다. 하나만 책임지게 둔다.
 *
 * 실패해도 아무 말 하지 않는다 — 서비스워커가 없어도 사이트는 그대로
 * 동작한다. 오프라인일 때 브라우저 기본 화면이 뜰 뿐이다.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (isNativeShell()) return;
    if (!('serviceWorker' in navigator)) return;

    // 첫 화면 그리기와 경쟁하지 않게 한 박자 미룬다
    const id = window.setTimeout(() => {
      void navigator.serviceWorker.register('/sw.js').catch(() => {});
    }, 1_000);

    return () => window.clearTimeout(id);
  }, []);

  return null;
}
