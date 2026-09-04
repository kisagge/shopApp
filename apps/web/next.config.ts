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

const config: NextConfig = {
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
