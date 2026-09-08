import type { MetadataRoute } from 'next';
import { DISALLOWED_PATHS } from '@shop/core';
import { absoluteUrl } from '~/lib/urls';

/**
 * robots.txt.
 *
 * **막는 목록은 core 하나만 본다.** 여기 손으로 적으면 화면의 noindex 와
 * 어긋나고, 어긋난 쪽은 아무도 모른다.
 *
 * robots 로 막는 것은 "긁지 마라" 이지 "색인하지 마라" 가 아니다. 다른 데서
 * 링크가 걸리면 내용 없이 주소만 검색 결과에 뜬다. 그래서 개인 화면에는
 * 화면 쪽에서 noindex 도 함께 건다(mypage·checkout 등의 metadata).
 *
 * **경로 뒤에 빗금을 붙이지 않는다.** 붙여 두었더니 `/cart/` 가 되었고,
 * robots 규칙은 앞자리 맞춤이라 `/cart` 는 그것으로 시작하지 않는다 —
 * 정작 막으려던 화면이 열려 있었다. `/cart` 는 그 화면과 그 아래를 함께
 * 막는다. 목록을 core 에서 가져오면서도 여기서 한 글자를 덧붙여 뜻이
 * 달라졌다 — 목록만 공유하고 **판정은 공유하지 않은 것**이 원인이다.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [...DISALLOWED_PATHS],
    },
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
