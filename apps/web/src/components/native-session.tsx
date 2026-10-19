'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { clearSessionToken, hydrateSessionToken, isNativeShell } from '@shop/native';

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

      /*
       * **거절당한 토큰은 지운다.**
       *
       * 서버가 401 을 주는 것은 그 토큰으로는 아무것도 안 된다는 뜻이다. 그런데 지우지
       * 않으면 그 글자가 기기에 그대로 남아, 앱을 켤 때마다 여기서 한 번 거절당하고
       * 창구를 부를 때마다 Bearer 로 따라간다 — 다음 로그인이 덮어쓸 때까지 죽은
       * 자격증명을 들고 다니는 셈이다. 화면은 로그인 화면이 맞고, 저장소도 그래야 한다.
       *
       * **끊긴 것과 거절당한 것을 가른다.** 망이 없으면 `res` 가 null 이다. 그걸 거절로
       * 보고 지우면, 지하철에서 앱을 켠 사람이 로그아웃된다.
       *
       * 지우는 일은 화면이 떠났어도 한다 — 저장소 정리라 그려진 것과 상관이 없다.
       */
      if (res?.status === 401) {
        await clearSessionToken();
        return;
      }
      if (alive && res?.ok) router.refresh();
    })();

    return () => {
      alive = false;
    };
  }, [signedIn, router]);

  return null;
}
