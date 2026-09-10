import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    /*
     * **상한은 멈춘 검사를 잡는 값이지 기계 속도를 재는 값이 아니다.**
     *
     * 기본값 5초로 두었더니 CI 처럼 부하가 걸린 기계에서 멀쩡한 검사들이
     * 줄줄이 졌다 — password-reset-form, signup-form, seo-coverage,
     * dictionary-safe 같은 것들이고, 전부 "5000ms 를 넘겼다" 였지 값이
     * 틀렸다가 아니었다. 한가할 때 0.3초로 끝나는 검사가 부하에서 15~30배가
     * 된다. 그 배수를 코드로 줄일 수는 없다.
     *
     * 올려도 **통과하는 검사는 느려지지 않는다** — 끝나면 끝난다. 늘어나는
     * 것은 정말 멈춘 검사가 지기까지의 시간뿐이다. 준비 훅은 모듈을 처음
     * 읽는 값을 치르는 자리라 더 넉넉히 둔다.
     */
    testTimeout: 20_000,
    hookTimeout: 60_000,
    include: ['test/**/*.test.ts'],
    coverage: { include: ['src/**/*.ts'], exclude: ['src/index.ts'] },
  },
});
