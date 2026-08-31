import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./src', import.meta.url)),
      // RSC 경계가 없는 테스트 환경에서는 가드를 무력화한다.
      // 진짜 검증은 next build 가 한다.
      'server-only': fileURLToPath(new URL('./test/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    // 파일별로 `// @vitest-environment jsdom` 주석을 붙여 필요한 곳만 DOM을 쓴다
    environment: 'node',
    include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: ['./test/setup.ts'],
  },
});
