import type { MetadataRoute } from 'next';

/**
 * 홈 화면에 추가했을 때의 모습.
 *
 * 이게 없으면 브라우저 탭 그대로 열려서, 추가해 봐야 즐겨찾기와 다르지
 * 않다. 네이티브 셸을 이미 붙였으니 웹 쪽에도 같은 입구를 둔다.
 *
 * **색은 화면과 같은 값을 쓴다.** 여기만 다르면 앱을 열 때 잠깐 다른 색이
 * 번쩍인다 — 시작 화면이 background_color 로 칠해지기 때문이다.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    // 같은 주소에서 다른 앱으로 잡히지 않게 고정한다
    id: '/',
    name: 'PLAIN',
    short_name: 'PLAIN',
    description: '오래 두고 입을 것만 골라 담은 편집숍',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    lang: 'ko',
    // 시작 화면과 상태바. layout 의 themeColor 라이트 값과 같다.
    background_color: '#FEFDFC',
    theme_color: '#FEFDFC',
    icons: [
      // 브라우저가 크기를 마음대로 고를 수 있는 벡터를 먼저 준다
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/pwa-icon/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa-icon/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      /*
       * 안드로이드는 아이콘을 원형·둥근사각형으로 잘라 쓴다. maskable 을
       * 주지 않으면 시스템이 흰 배경에 아이콘을 축소해 넣어 어색해진다.
       * 여백을 넉넉히 둔 같은 그림을 그대로 쓴다.
       */
      { src: '/pwa-icon/512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
