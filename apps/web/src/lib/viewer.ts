import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { unstable_rethrow } from 'next/navigation';
import { getCurrentUser, getSessionUser, type CurrentUser, type SessionUser } from '@shop/auth/session';

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

/**
 * 헤더가 쓰는 사람 — 역할을 **지금 상태로** 본다.
 *
 * 헤더의 역할 뱃지는 콘솔로 가는 문이다. 세션에 실린 역할로 그리면 정지된 가맹점에게 문이 그대로 남고, 눌러 보면
 * 말없이 튕긴다. 가맹점 계정일 때만 왕복이 하나 더 는다(getCurrentUser).
 */
export const getNavUser = cache(async (): Promise<CurrentUser | null> => {
  try {
    return await getCurrentUser(await headers());
  } catch (error) {
    unstable_rethrow(error);
    return null;
  }
});
