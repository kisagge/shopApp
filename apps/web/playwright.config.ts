import { defineConfig, devices } from '@playwright/test';
import { STATE_FILE } from './e2e/state';

/**
 * E2E 설정.
 *
 * 지금까지 브라우저로 손수 확인해 온 것들을 자동화한다. 단위·통합 테스트가
 * 1,100개 넘게 있지만 **전부 목(mock) 위에서 돈다** — Prisma 도, 세션도,
 * 라우팅도 가짜다. 진짜 서버와 진짜 DB 를 거쳐야만 드러나는 것들이 이
 * 대화에서만 여러 번 나왔다(중첩 form, 옛 Prisma 클라이언트, 라벨 불일치).
 */
const PORT = Number(process.env['E2E_PORT'] ?? 3100);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  // vitest 는 test/ 만 본다. 서로 건드리지 않는다.
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  // 로컬에서는 Playwright 기본값(코어 수)에 맡기고, CI 에서는 재현하기
  // 쉽게 줄인다. exactOptionalPropertyTypes 라 undefined 를 넘기지 못하므로
  // 아예 키를 빼서 기본값을 쓰게 한다.
  ...(process.env['CI'] ? { workers: 2 } : {}),
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : [['list']],

  /**
   * **상한은 멈춘 검사를 잡는 값이지 기계 속도를 재는 값이 아니다.**
   *
   * 기다림의 기본값은 5초인데, 부하가 걸린 기계에서 멀쩡한 검사가 줄줄이
   * 졌다 — 로그인 setup 이 헤더 링크를 못 기다려 8초에 지고, 그 setup 이
   * 지면 그 프로젝트의 검사 이백여 개가 아예 안 돈다. 한가할 때 0.3초로
   * 끝나는 일이 부하에서 열댓 배가 되는데 그 배수는 코드로 못 줄인다.
   *
   * 올려도 **통과하는 검사는 느려지지 않는다** — 조건이 참이 되면 곧바로
   * 끝난다. 늘어나는 것은 정말 멈춘 검사가 지기까지의 시간뿐이다.
   * 검사 하나의 상한(30초)보다 낮게 둬서, 지더라도 무엇을 못 찾았는지가
   * 찍히게 한다 — 검사 상한에 먼저 걸리면 그 내용이 안 나온다.
   */
  expect: { timeout: 15_000 },

  use: {
    baseURL: BASE_URL,
    // 실패했을 때 무엇을 보고 있었는지 알 수 있어야 한다
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    /**
     * 언어와 시간대를 못 박는다.
     *
     * 화면은 브라우저가 보내는 Accept-Language 를 따라 세 나라 말로 나가므로,
     * 여기를 비워 두면 **테스트가 도는 환경에 따라 화면 언어가 바뀐다** —
     * 크로미움 기본값은 보통 en-US 다. 한국어 문구를 찾는 검사가 CI 에서만
     * 깨지는 길이 그것이다. 날짜도 같은 이유로 서울에 고정한다.
     */
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  },

  /**
   * 세션을 한 번만 만들고 나눠 쓴다.
   *
   * 테스트마다 로그인하면 워커들이 같은 계정으로 동시에 로그인 요청을
   * 보내고, 인증 서버가 그것을 받아 줄 이유가 없다 — 처음에 그렇게 짰다가
   * 로그인이 줄줄이 시간 초과로 실패했다.
   *
   * 로그인 화면 자체는 auth.spec.ts 가 세션 없이 따로 확인한다.
   */
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'guest',
      use: { ...devices['Desktop Chrome'] },
      testMatch:
        /(auth|shopping|a11y|a11y-public|pwa|i18n|recently-viewed|support|recommendations|search-suggest|collections|security-headers|brand-and-filters|compare|layout|image-priority|bundle-budget|web-vitals|sitemap|structured-data|layout-i18n|dark-contrast|theme-flip|theme-choice)\.spec\.ts/,
    },
    {
      name: 'customer',
      use: { ...devices['Desktop Chrome'], storageState: STATE_FILE.customer },
      testMatch:
        /(customer|review-helpful|notifications|order-idempotency|a11y-account|layout-customer|layout-customer-locales|prefetch-budget|nav-feedback|order-lifecycle|deposit-webhook|checkout-total|payment-callback|stock-race|double-spend|order-search|low-stock-alert|partial-cancel|partial-return|merchant-return|wishlist-restock|exchange)\.spec\.ts/,
      dependencies: ['setup'],
    },
    {
      name: 'admin',
      use: { ...devices['Desktop Chrome'], storageState: STATE_FILE.admin },
      testMatch:
        /(admin|slug-history|a11y-admin|layout-admin|layout-admin-locales|separation-of-duties|admin-drawer|dark-contrast-admin|rich-editor|shipping-policy-admin)\.spec\.ts/,
      dependencies: ['setup'],
    },
    {
      name: 'merchant',
      use: { ...devices['Desktop Chrome'], storageState: STATE_FILE.merchant },
      testMatch: /merchant\.spec\.ts/,
      dependencies: ['setup'],
    },
  ],

  /**
   * **프로덕션 빌드로 띄운다.**
   *
   * 처음에는 dev 로 띄웠는데 두 가지가 걸렸다.
   * 1. Next dev 는 같은 디렉터리에서 두 번 뜨지 못한다. 작업하며 띄워 둔
   *    개발 서버가 있으면 테스트가 아예 시작되지 않는다.
   * 2. 어차피 배포되는 것은 빌드 결과물이다. RSC 경계나 'server-only'
   *    같은 것은 빌드에서만 드러난다.
   *
   * 3100 을 쓰는 이유는 작업 중인 3000 을 건드리지 않기 위해서다.
   */
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env['CI'],
    timeout: 300_000,
    stdout: 'pipe',
    stderr: 'pipe',
    /**
     * 주소를 서버에도 알려 준다.
     *
     * .env 의 BETTER_AUTH_URL 은 3000 으로 고정돼 있다. 그대로 두면
     * 3100 에서 온 로그인 요청이 신뢰 출처가 아니라 막히고, 화면은
     * "로그인 중…" 에서 멈춘 채로 남는다 — 처음 돌렸을 때 실제로 그랬다.
     *
     * 배포에서 겪은 것과 같은 문제다. 출처 검사는 주소가 바뀌면 반드시
     * 함께 손봐야 한다.
     */
    env: {
      BETTER_AUTH_URL: BASE_URL,
      NEXT_PUBLIC_APP_URL: BASE_URL,
      /**
       * 로그인 요청 제한을 끈다.
       *
       * 짧은 시간에 여러 계정으로 로그인하면 제한에 걸려 "요청이 너무
       * 잦습니다" 로 실패한다 — 처음 돌렸을 때 실제로 그랬다.
       *
       * **여기서만 끈다.** 운영에는 이 변수가 없고, 기본이 켜짐이라는 것은
       * packages/auth 의 단위 테스트가 지킨다.
       */
      AUTH_RATE_LIMIT: 'off',
      /**
       * 결제 게이트웨이를 Mock 으로 대놓고 고른다.
       *
       * 이게 없으면 승인 뒤가 화면 검사를 한 번도 지나가지 못한다 — 이 서버는
       * `next start` 로 도는 프로덕션 빌드라 실제 결제 키를 요구받는다.
       *
       * **운영으로 새면 결제 없이 주문이 확정된다.** 그래서 게이트웨이 쪽에
       * 두 겹을 뒀다: 운영 배포(VERCEL_ENV=production)에서 켜면 던지고,
       * 진짜 키가 있는데 켜도 던진다. 커밋된 설정에 이 이름이 없다는 것까지
       * 단위 검사가 지킨다.
       */
      PAYMENT_GATEWAY: 'mock',
    },
  },
});
