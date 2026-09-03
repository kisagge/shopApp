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
