'use client';

import { createAuthClient } from 'better-auth/react';

/**
 * 브라우저용 클라이언트.
 *
 * 웹에서는 쿠키로 붙는다. Capacitor 셸에서는 같은 오리진을 로드하므로
 * 웹뷰 쿠키가 그대로 동작하고, 쿠키가 유실되는 환경에서만 Bearer 로 폴백한다.
 */
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
});

export const { signIn, signUp, signOut, useSession, getSession } = authClient;
