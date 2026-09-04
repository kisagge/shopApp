import { test, expect } from '@playwright/test';
import { SEED_ACCOUNT, SEED_PASSWORD } from '@shop/auth/seed-fixtures';

/**
 * 로그인 화면 자체.
 *
 * 다른 테스트는 저장된 세션으로 지름길을 타므로, 이 화면이 실제로
 * 동작하는지는 여기서만 확인한다. 지름길이 검증을 빼내면 안 된다.
 */
test.use({ storageState: { cookies: [], origins: [] } });

// 같은 이유로 직렬. 로그인 요청이 몰리면 제한에 걸린다.
test.describe.configure({ mode: 'serial' });

test('로그인하면 헤더가 바뀐다', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('이메일').fill(SEED_ACCOUNT.customer);
  await page.getByLabel('비밀번호').fill(SEED_PASSWORD);
  await page.getByRole('button', { name: '로그인' }).click();

  await expect(page.getByRole('link', { name: '마이페이지' })).toBeVisible();
  await expect(page.getByRole('link', { name: '로그인' })).toHaveCount(0);
});

test('틀린 비밀번호는 어느 쪽이 틀렸는지 알려 주지 않는다', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('이메일').fill(SEED_ACCOUNT.customer);
  await page.getByLabel('비밀번호').fill('틀린비밀번호');
  await page.getByRole('button', { name: '로그인' }).click();

  // Next 의 라우트 안내 요소도 role="alert" 다. 폼 안의 것만 본다.
  const alert = page.locator('form [role="alert"]');
  await expect(alert).toContainText('이메일 또는 비밀번호');
  await expect(alert).not.toContainText('없는 계정');
});

test('로그인 뒤 원래 가려던 곳으로 돌아간다', async ({ page }) => {
  await page.goto('/mypage');
  await expect(page).toHaveURL(/\/login\?next=/);

  await page.getByLabel('이메일').fill(SEED_ACCOUNT.customer);
  await page.getByLabel('비밀번호').fill(SEED_PASSWORD);
  await page.getByRole('button', { name: '로그인' }).click();

  await expect(page).toHaveURL(/\/mypage/);
});

/**
 * 회원가입.
 *
 * 시드 계정은 이미 있는 것을 쓰므로, **처음 오는 사람이 실제로 계정을
 * 만들 수 있는지**는 여기서만 확인된다. 화면이 없던 동안 이 경로는
 * 아무도 밟지 않았다.
 */
test('처음 온 사람이 가입하고 바로 로그인된 상태가 된다', async ({ page }) => {
  // 매번 새 주소여야 한다 — 같은 주소로 두 번 돌리면 두 번째부터 실패한다
  const email = `e2e-${Date.now()}@plain.test`;

  await page.goto('/signup');
  await page.getByLabel(/^이메일/).fill(email);
  await page.getByLabel(/^이름/).fill('가입 테스트');
  await page.getByLabel(/^비밀번호\*/).fill('quiet-harbor-42');
  await page.getByLabel(/^비밀번호 확인/).fill('quiet-harbor-42');
  await page.getByRole('button', { name: '가입하기' }).click();

  await expect(page.getByRole('link', { name: '마이페이지' })).toBeVisible();

  // 가입 포인트가 원장으로 들어갔는지는 화면에서 확인한다
  await page.goto('/mypage/points');
  await expect(page.locator('#main')).toContainText('가입');
});

test('이미 가입된 주소는 그 칸에서 알려 준다', async ({ page }) => {
  await page.goto('/signup');
  await page.getByLabel(/^이메일/).fill(SEED_ACCOUNT.customer);
  await page.getByLabel(/^이름/).fill('중복 테스트');
  await page.getByLabel(/^비밀번호\*/).fill('quiet-harbor-42');
  await page.getByLabel(/^비밀번호 확인/).fill('quiet-harbor-42');
  await page.getByRole('button', { name: '가입하기' }).click();

  await expect(page.getByText('이미 가입된 이메일입니다')).toBeVisible();
});

test('로그인과 회원가입은 서로 오갈 수 있다', async ({ page }) => {
  // 헤더에도 로그인 링크가 있으므로 본문 안에서만 찾는다
  const main = page.locator('#main');

  await page.goto('/login');
  await main.getByRole('link', { name: '회원가입' }).click();
  await expect(page).toHaveURL(/\/signup$/);

  await main.getByRole('link', { name: '로그인' }).click();
  await expect(page).toHaveURL(/\/login$/);
});
