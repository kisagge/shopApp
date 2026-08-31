import type { NextConfig } from 'next';

const config: NextConfig = {
  // 워크스페이스 패키지는 TS 소스를 그대로 내보내므로 Next가 직접 컴파일한다.
  transpilePackages: ['@shop/ui', '@shop/core', '@shop/auth', '@shop/db'],
  experimental: {
    // 모노레포 루트를 파일 추적 기준으로 삼는다
    externalDir: true,
  },
  typedRoutes: true,
};

export default config;
