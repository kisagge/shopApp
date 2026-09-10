'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { hydrateSessionToken, isNativeShell } from '@shop/native';

/**
 * 네이티브 셸에서 저장해 둔 세션 토큰으로 **서버 세션까지 되살린다.**
 *
 * 앱이 뜰 때 한 번만 한다. 브라우저에서는 아무 일도 하지 않는다 — 웹은
 * 쿠키로 붙는다. 화면을 그리지 않으므로 하이드레이션에 영향도 없다.
 *
 * ── 왜 토큰을 올리는 것만으로는 모자란가 ────────────────────────
 * 토큰은 `authClient` 가 부르는 auth 창구에만 Bearer 로 실린다. 이 앱의
 * 화면 쉰한 장은 전부 서버가 그리고 **쿠키를 읽는다.** 실기기에서 쿠키를
 * 지우고 재 보니 헤더는 되살아나는데 `/mypage` 는 `/login` 으로 넘어갔다 —
 * 로그인한 것처럼 보이지만 갈 수 있는 곳이 없었다.
 *
 * 그래서 토큰을 올린 뒤, **서버가 이미 알아본 상태가 아니면** 쿠키로
 * 되돌려 달라고 한 번 요청한다(`/api/native/session`). 성공하면 지금 화면을
 * 서버에서 다시 받아 온다 — 그래야 서버가 그린 부분이 로그인 상태로 바뀐다.
 */
export function NativeSession({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!isNativeShell()) return;

    let alive = true;
    void (async () => {
      const token = await hydrateSessionToken();
      // 서버가 이미 알아봤으면 할 일이 없다. 토큰이 없어도 마찬가지다.
      if (!alive || signedIn || !token) return;

      const res = await fetch('/api/native/session', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      }).catch(() => null);

      // 토큰이 낡았으면 서버가 401 을 준다. 그때는 로그인 화면이 맞다.
      if (alive && res?.ok) router.refresh();
    })();

    return () => {
      alive = false;
    };
  }, [signedIn, router]);

  return null;
}
