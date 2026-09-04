'use client';

import { createAuthClient } from 'better-auth/react';
import {
  isNativeShell, sessionToken, saveSessionToken, clearSessionToken,
} from '@shop/native';

/**
 * 브라우저용 클라이언트.
 *
 * 웹에서는 쿠키로 붙는다. **네이티브 셸에서만 Bearer 로 간다** — 웹뷰는 앱을
 * 다시 띄울 때 쿠키가 날아가는 경우가 있고, 그러면 사용자는 켤 때마다 로그인을
 * 해야 한다. 이것이 Better Auth 를 고른 이유이기도 하다(bearer 플러그인).
 *
 * 토큰은 로그인 응답 헤더로 온다. 웹에서는 저장하지도 붙이지도 않는다 —
 * 쿠키가 이미 하고 있는 일을 두 번 할 이유가 없고, 토큰을 브라우저 저장소에
 * 두면 XSS 로 새어 나갈 자리를 하나 더 만드는 셈이다.
 */
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,

  fetchOptions: {
    /**
     * 요청마다 토큰을 **동기로** 묻는다. 그래서 메모리에 들고 있는 값을 준다 —
     * 앱이 뜰 때 hydrateSessionToken() 이 저장소에서 한 번 올려 둔다.
     */
    auth: {
      type: 'Bearer',
      token: () => (isNativeShell() ? (sessionToken() ?? '') : ''),
    },

    onSuccess: (ctx) => {
      if (!isNativeShell()) return;

      // 로그인·가입 응답에만 실려 온다
      const token = ctx.response.headers.get('set-auth-token');
      if (token) void saveSessionToken(token);
    },
  },
});

/**
 * 로그아웃.
 *
 * 서버 세션을 지우고 **저장해 둔 토큰도 함께 지운다.** 토큰만 남으면 다음
 * 실행에서 서버가 거절할 때까지 로그인한 것처럼 보인다.
 */
export async function signOutEverywhere(): Promise<void> {
  try {
    await authClient.signOut();
  } finally {
    await clearSessionToken();
  }
}

export const { signIn, signUp, signOut, useSession, getSession } = authClient;
