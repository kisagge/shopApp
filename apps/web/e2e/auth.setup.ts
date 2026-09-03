import { test as setup } from '@playwright/test';
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
    await page.getByRole('link', { name: '마이페이지' }).waitFor();

    await page.context().storageState({ path: STATE_FILE[role] });
  });
}
