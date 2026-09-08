'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isNativeShell, onAppUrlOpen } from '@shop/native';

/**
 * 링크로 앱이 열렸을 때 그 화면으로 옮긴다.
 *
 * **셸이 이미 우리 도메인을 띄우고 있어도 자동으로 옮겨 가지 않는다.**
 * 밖에서 상품 링크를 눌러 앱이 뜨면 웹뷰는 마지막으로 보던 자리에 그대로
 * 있고, 사용자는 자기가 누른 상품이 아니라 엉뚱한 화면을 만난다.
 *
 * 앱 안에서만 산다. 브라우저에는 이 신호가 없다.
 */
export function NativeDeepLink() {
  const router = useRouter();

  useEffect(() => {
    if (!isNativeShell()) return;
    /*
     * push 로 옮긴다 — replace 를 쓰면 링크로 들어오기 전에 보던 화면이
     * 사라져서, 뒤로 가기가 앱을 그냥 닫아 버린다.
     */
    return onAppUrlOpen((path) => router.push(path as never));
  }, [router]);

  return null;
}
