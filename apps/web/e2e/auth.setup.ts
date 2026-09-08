import { test as setup, expect } from '@playwright/test';
import { SEED_PASSWORD, SEED_ACCOUNT } from '@shop/auth/seed-fixtures';
import { STATE_FILE } from './state';

/**
 * 로그인은 **한 번에 하나씩** 한다.
 *
 * next start(프로덕션 모드)에서는 인증 요청 제한이 켜진다. 네 계정을
 * 동시에 로그인시키면 뒤엣것들이 막혀 시간 초과로 실패한다 — 처음
 * 돌렸을 때 실제로 그랬다. 제한을 끄는 대신 순서대로 한다.
 */
setup.describe.configure({ mode: 'serial' });

/**
 * 로그인 하나에 30초는 좁다.
 *
 * 일곱 번을 한 줄로 세우는데, 그중 첫 몇 번은 **아직 아무도 안 열어 본
 * 화면**을 여는 것이라 서버가 그 자리에서 만들어 낸다. CI 의 러너는 내
 * 기계보다 느리고 워커도 둘뿐이라 그 몫이 더 크다. 기본값 그대로 두면
 * 느린 것과 거절당한 것이 똑같이 "30초 지났다" 로 끝난다.
 */
setup.setTimeout(60_000);

/**
 * 역할별로 한 번씩 로그인해 세션을 저장한다.
 *
 * 테스트마다 로그인하면 워커들이 **같은 계정으로 동시에 로그인 요청**을
 * 보낸다. 처음에 그렇게 짰더니 로그인이 시간 초과로 줄줄이 실패했다 —
 * 인증 서버가 그런 부하를 받아 줄 이유가 없다.
 *
 * 로그인 화면 자체는 auth.spec.ts 가 따로 확인한다. 그래야 이 지름길이
 * 로그인 화면을 검증에서 빼내지 않는다.
 */
/**
 * 실제로 쓰는 역할만 로그인한다.
 *
 * 안 쓰는 세션까지 만들면 로그인 요청만 늘고, 그만큼 요청 제한에 가까워진다.
 */
for (const role of Object.keys(STATE_FILE) as (keyof typeof STATE_FILE)[]) {
  const email = SEED_ACCOUNT[role];
  setup(`${role} 로그인`, async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('이메일').fill(email);
    await page.getByLabel('비밀번호').fill(SEED_PASSWORD);
    await page.getByRole('button', { name: '로그인' }).click();

    /*
     * **거절과 느림을 갈라 놓는다.**
     *
     * 예전에는 마이페이지 링크만 기다렸다. 그러면 계정이 없거나 비밀번호가
     * 틀렸을 때도 "링크를 30초 기다렸다" 로 끝나서, 시드가 그 계정을 안
     * 만든 것인지 서버가 느린 것인지 알 수 없다. 화면은 이유를 말해 주고
     * 있는데 그걸 안 읽은 셈이다.
     *
     * 그래서 둘 중 먼저 오는 것을 받고, 거절이면 그 문구를 그대로 올린다.
     */
    const signedIn = page.getByRole('link', { name: '마이페이지' });
    /*
     * **본문 안의 alert 만 본다.** 문서 끝에는 Next 가 심어 둔 라우트
     * 알림(role=alert)이 늘 하나 있고 거기엔 페이지 제목이 들어간다.
     * 그것까지 세면 로그인이 성공해도 "거절됐다" 가 된다 — 실제로 그렇게
     * 한 번 헛짚었다.
     */
    const rejected = page.locator('#main').getByRole('alert');
    await expect(signedIn.or(rejected).first()).toBeVisible();
    await expect(rejected, `${email} 로그인이 거절됐다 — 시드가 이 계정을 만들었는지 본다`)
      .toHaveCount(0);
    await signedIn.waitFor();

    await page.context().storageState({ path: STATE_FILE[role] });
  });
}
