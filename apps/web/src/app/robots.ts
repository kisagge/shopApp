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
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: DISALLOWED_PATHS.map((path) => `${path}/`),
    },
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
