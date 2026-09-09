import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { unstable_rethrow } from 'next/navigation';
import { getSessionUser, type SessionUser } from '@shop/auth/session';

/**
 * 이번 요청을 보낸 사람.
 *
 * **요청 안에서 한 번만 읽는다.** 헤더와 장바구니 동기화와 목록의 찜 표시가
 * 저마다 물으면 한 화면에 세션 조회가 세 번 나간다.
 *
 * 요청 맥락이 없으면 비로그인으로 본다 — `getLocale` 과 같은 결이다. 다만
 * Next 가 흐름을 제어하려고 던지는 것은 그대로 넘긴다.
 */
export const getViewer = cache(async (): Promise<SessionUser | null> => {
  try {
    return await getSessionUser(await headers());
  } catch (error) {
    unstable_rethrow(error);
    return null;
  }
});
