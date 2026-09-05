import type { NextConfig } from 'next';

/**
 * 이미지 저장소의 공개 호스트.
 *
 * **비밀이 아니다.** 이 주소는 모든 상품 사진의 src 에 들어가 페이지 HTML
 * 로 그대로 나간다. 여기 적어 두는 것으로 새는 것은 없다.
 *
 * 그런데도 적어 두는 이유는 겪어서다 — 이 값을 환경변수에서만 읽게 했더니
 * 배포 빌드에 그 변수가 없어서 허용 목록이 비었고, **상품 사진이 전부
 * 400 으로 깨졌다.** 읽기에는 변수가 필요 없어서(주소가 DB 에 있다) 그때까지
 * 아무도 몰랐다. 설정 하나가 빠졌을 때 사이트가 통째로 망가지는 쪽보다는
 * 기본값을 두고 환경변수로 덮는 쪽이 낫다.
 */
const FALLBACK_IMAGE_HOST = 'pub-c08272fd498f4808b376f4e97004f2c5.r2.dev';

const remoteImageHost = ((raw: string | undefined): string => {
  if (!raw) {
    console.warn(
      `[next.config] S3_PUBLIC_BASE_URL 이 없어 기본 호스트를 씁니다 (${FALLBACK_IMAGE_HOST}).`,
    );
    return FALLBACK_IMAGE_HOST;
  }
  try {
    return new URL(raw).hostname;
  } catch {
    console.warn('[next.config] S3_PUBLIC_BASE_URL 을 주소로 읽을 수 없습니다:', raw);
    return FALLBACK_IMAGE_HOST;
  }
})(process.env['S3_PUBLIC_BASE_URL']);

/**
 * 요청과 무관하게 늘 같은 보안 헤더.
 *
 * 아무것도 없었다 — `curl -I` 로 확인했다. CSP 는 요청마다 nonce 가 달라져야
 * 해서 여기가 아니라 proxy.ts 가 붙인다.
 */
const SECURITY_HEADERS = [
  /**
   * 브라우저가 내용을 보고 형식을 짐작하지 않게 한다.
   *
   * 사용자가 올린 파일이 text/plain 으로 나가도, 브라우저가 "이건 HTML
   * 같은데" 하고 실행해 버리는 길이 이것으로 막힌다.
   */
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  /**
   * 우리 화면을 남의 페이지에 끼워 넣지 못하게.
   *
   * CSP 의 frame-ancestors 와 겹치지만 남겨 둔다 — 옛 브라우저는 CSP 쪽을
   * 모른다. 클릭재킹은 결제·주문 화면에서 특히 값이 크다.
   */
  { key: 'X-Frame-Options', value: 'DENY' },
  /**
   * 남의 사이트로 나갈 때 주소를 통째로 넘기지 않는다.
   *
   * 주문 상세(/order/20260905-0000001)에서 밖으로 나가면 그 주문번호가
   * 남의 서버 로그에 남는다. 같은 출처에는 그대로, 밖으로는 도메인만.
   */
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  /**
   * 쓰지 않는 장치 권한을 꺼 둔다.
   *
   * 결제는 넣지 않는다 — 토스는 Payment Request API 가 아니라 자기 창을
   * 띄우지만, 확인하지 못한 것을 막아 두면 결제가 안 되는 쪽으로 틀린다.
   * 못 막아 생기는 손해보다 결제가 막히는 손해가 크다.
   */
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  /**
   * https 로만 오게 한다.
   *
   * Vercel 이 이미 붙여 주지만 다른 곳에 올릴 때를 대비해 우리도 적어 둔다.
   * 브라우저는 http 응답의 이 헤더를 무시하므로 개발 서버에는 영향이 없다.
   */
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
];

const config: NextConfig = {
  // Next 는 Promise 를 요구한다. 안에서 기다릴 것은 없다.
  headers: () => Promise.resolve([{ source: '/:path*', headers: SECURITY_HEADERS }]),

  // 워크스페이스 패키지는 TS 소스를 그대로 내보내므로 Next가 직접 컴파일한다.
  transpilePackages: ['@shop/ui', '@shop/core', '@shop/auth', '@shop/db'],
  experimental: {
    // 모노레포 루트를 파일 추적 기준으로 삼는다
    externalDir: true,
  },
  typedRoutes: true,

  images: {
    /**
     * 이미지를 가져올 수 있는 곳.
     *
     * **저장소 주소에서 호스트를 뽑는다.** `*.r2.dev` 처럼 넓게 열면 남의
     * 버킷 이미지도 우리 최적화기가 받아 오게 되고, 그건 우리 계정으로
     * 돌아가는 공짜 이미지 프록시가 된다.
     *
     * 값이 없으면 위의 기본 호스트를 쓴다 — 빈 목록으로 두면 사진이
     * 전부 깨지는데, 그게 배포 뒤에야 드러난다.
     */
    remotePatterns: [{ protocol: 'https' as const, hostname: remoteImageHost, pathname: '/**' }],
  },
};

export default config;
