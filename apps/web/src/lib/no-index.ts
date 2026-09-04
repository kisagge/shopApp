import type { Metadata } from 'next';

/**
 * 검색 결과에 뜨면 안 되는 화면의 표시.
 *
 * robots.txt 로 막는 것은 "긁지 마라" 이지 "색인하지 마라" 가 아니다. 다른
 * 데서 링크가 걸리면 내용 없이 주소만 검색 결과에 뜬다 — 로그인 화면이나
 * 남의 주문 주소가 그렇게 노출된다.
 *
 * `follow` 는 남긴다. 이 화면을 색인하지는 않되, 여기서 나가는 링크는
 * 따라가도 된다 — 막을 이유가 없다.
 */
export const NO_INDEX: Metadata = {
  robots: { index: false, follow: true },
};
