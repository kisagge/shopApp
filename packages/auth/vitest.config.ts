import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    /**
     * 기본값(5초)으로는 부족하다.
     *
     * 이 패키지의 테스트는 환경변수를 바꿔 가며 **모듈을 새로 임포트**한다.
     * 그 한 번에 better-auth 와 프리즈마 클라이언트가 함께 딸려 와서, 단독
     * 실행에서도 2.5~2.8초가 걸린다. 빌드와 나란히 돌면 그대로 5초를 넘겨
     * 코드와 무관하게 실패한다 — 실제로 그렇게 두 번 깨졌다.
     *
     * 늘리는 것으로 끝내지 않고 이유를 적어 둔다. 이 값이 다시 모자라면
     * 임포트가 무거워졌다는 신호지 시간을 더 주면 되는 문제가 아니다.
     */
    testTimeout: 20_000,
    coverage: { include: ['src/**/*.ts'] },
  },
});
