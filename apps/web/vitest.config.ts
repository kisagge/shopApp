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
      // 데이터 캐시도 같은 이유로 대체한다 — 자세한 것은 stubs/next-cache.ts
      'next/cache': fileURLToPath(new URL('./test/stubs/next-cache.ts', import.meta.url)),
    },
  },
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
    /**
     * **`isolate: false` 를 쓰지 않는다 — 돌려 보고 정한 것이다.**
     *
     * vitest 가 끝날 때마다 권한다: "워커 421개를 띄우고 파일마다 ~280ms 를 치른다,
     * `isolate: false` 면 13초쯤 빠르다." 숫자는 맞다 — 36.9초가 11.6초가 된다.
     * 그런데 **검사 417개가 37파일에서 진다**(vitest 5.1.0 에서 잼).
     *
     * 까닭은 이 저장소가 흉내 내는 방식이다. 파일마다 `vi.mock('@shop/db', …)` 로
     * **자기가 쓰는 모델만** 흉내 낸다(주문 검사는 `order`, 리뷰 검사는 `review`).
     * 워커를 공유하면 옆 파일의 부분 흉내를 그대로 받아 `prisma.product.findMany is not
     * a function`·`Cannot read properties of undefined (reading 'findUnique')` 가
     * 쏟아진다. 실패 417개가 거의 다 그 모양이다.
     *
     * **판을 함께 적는 까닭:** 5.0.5 에서는 39파일·347개였다. 수는 판마다 흔들리지만
     * 모양은 그대로다 — 판 없는 숫자는 조용히 낡아서 다음 사람이 다시 재게 만든다.
     *
     * 고치려면 파일마다 흉내를 "전체 모델" 로 키워야 하는데, 그러면 **검사가 쓰지 않는
     * 모델까지 적게 되고** 어느 검사가 무엇에 기대는지 읽을 수 없게 된다. 25초를 아끼려고
     * 치를 값이 아니다. 받아도 곧바로 빨개지므로 위험하지는 않다 — 적어 두는 까닭은
     * **같은 실험을 다시 하지 않게** 하려는 것이다(타입스크립트 7·prisma 미리보기와 같다).
     */
    // 파일별로 `// @vitest-environment jsdom` 주석을 붙여 필요한 곳만 DOM을 쓴다
    environment: 'node',
    include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: ['./test/setup.ts'],
    /**
     * 커버리지는 **퍼센트로 문지기를 세우려는 것이 아니다.**
     *
     * 숫자를 문턱으로 걸면 수를 채우는 검사가 생기고, 그건 검사가 아니라 장식이다. 여기서
     * 쓰려는 것은 하나뿐이다 — **"어느 소스 파일이 한 줄도 실행되지 않았나"**. 그 질문을
     * 이름으로 묻다가 거짓 양성을 네 번 냈다(이 저장소는 상수나 함수 이름을 적지 않고 덮는
     * 방식을 많이 쓴다). 데이터로 물으면 그런 착각이 없다.
     *
     * 생성물과 타입 선언은 뺀다 — 실행될 줄이 없는 파일이 0% 로 잡히면 읽을 것이 묻힌다.
     */
    coverage: {
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts', 'src/lib/i18n/client-groups.generated.ts'],
    },
  },
});
