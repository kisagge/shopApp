import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { unstable_rethrow } from 'next/navigation';
import { isTheme, THEME_COOKIE, type Theme } from '@shop/core';

/**
 * 이번 요청의 밝기.
 *
 * **서버에서 정해서 `<html>` 에 박는다.** 브라우저에서 정하면 첫 그림은
 * 반드시 밝게 그려지고 그다음에 어두워진다 — 어두운 방에서 쓰는 사람에게
 * 한 번씩 흰 화면이 번쩍인다. 쿠키는 요청과 함께 오므로 첫 HTML 부터
 * 맞는 색으로 나갈 수 있다.
 *
 * 요청 맥락이 없으면 `system` 으로 물러난다 — `getLocale` 과 같은 결이다.
 * 다만 Next 가 흐름을 제어하려고 던지는 것은 그대로 넘긴다.
 */
export const getTheme = cache(async (): Promise<Theme> => {
  try {
    const value = (await cookies()).get(THEME_COOKIE)?.value;
    return isTheme(value) ? value : 'system';
  } catch (error) {
    unstable_rethrow(error);
    return 'system';
  }
});
