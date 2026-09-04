import type { NextConfig } from 'next';

/** 저장소의 공개 주소에서 호스트만 꺼낸다. 형식이 이상하면 없는 것으로 본다. */
const remoteImageHost = ((raw: string | undefined): string | null => {
  if (!raw) return null;
  try {
    return new URL(raw).hostname;
  } catch {
    console.warn('[next.config] S3_PUBLIC_BASE_URL 을 주소로 읽을 수 없습니다:', raw);
    return null;
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
     * 값이 없으면 아무 데도 허용하지 않는다 — 저장소가 설정되지 않은
     * 상태라 원격 이미지 자체가 없다. 빌드는 이 값 없이도 통과해야 한다.
     */
    remotePatterns: remoteImageHost
      ? [{ protocol: 'https' as const, hostname: remoteImageHost, pathname: '/**' }]
      : [],
  },
};

export default config;
