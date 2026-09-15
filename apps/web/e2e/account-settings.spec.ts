import { test, expect, type Page } from '@playwright/test';
import { ready } from './state';

/**
 * 회원정보 수정 · 비밀번호 변경 — 새로 가입한 계정으로 끝까지.
 *
 * 공유 계정의 비밀번호를 바꾸면 그 계정으로 로그인하는 다른 검사가 전부 진다. 그래서 **매번 새로 가입한다**(가입
 * 검사와 같다). 여기서 보는 것:
 * - 이름을 바꾸면 머리의 이름이 곧바로 바뀐다(세션 쿠키를 다시 굽는다)
 * - 연락처는 서버가 맞춘 모양으로 저장되어 다시 열어도 그대로다
 * - 틀린 지금 비밀번호는 그 칸에서 막히고, 바꾼 뒤에는 **새 비밀번호로만** 들어온다
 */

test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ mode: 'serial' });

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await ready(page);
  await page.getByLabel('이메일').fill(email);
  await page.getByLabel('비밀번호').fill(password);
  await page.getByRole('button', { name: '로그인' }).click();
}

test('이름·연락처를 고치고 비밀번호를 바꾸면, 머리 이름이 바뀌고 새 비밀번호로만 들어온다', async ({ page }) => {
  test.setTimeout(90_000);
  const email = `e2e-account-${Date.now()}@plain.test`;
  const original = 'quiet-harbor-42';
  const changed = 'silver-meadow-77';

  await page.goto('/signup');
  await ready(page);
  await page.getByLabel(/^이메일/).fill(email);
  await page.getByLabel(/^이름/).fill('설정 검사');
  await page.getByLabel(/^비밀번호\*/).fill(original);
  await page.getByLabel(/^비밀번호 확인/).fill(original);
  await page.getByRole('button', { name: '가입하기' }).click();
  await expect(page.getByRole('link', { name: '마이페이지' })).toBeVisible();

  // ── 마이페이지 메뉴에서 들어간다
  await page.goto('/mypage');
  await ready(page);
  await page.getByRole('link', { name: '회원정보 수정' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '회원정보' })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();

  // ── 이름·연락처
  const profile = page.getByRole('region', { name: '기본 정보' });
  await profile.getByLabel(/^이름/).fill('바뀐 이름');
  await profile.getByLabel(/^연락처/).fill('01098765432');
  await profile.getByRole('button', { name: '저장' }).click();
  await expect(profile.getByRole('status')).toHaveText('회원정보를 저장했습니다.');
  await expect(page.getByRole('banner').getByText('바뀐 이름', { exact: true }).locator('visible=true')).toHaveCount(1);

  await page.reload();
  await ready(page);
  await expect(profile.getByLabel(/^연락처/)).toHaveValue('010-9876-5432');

  // ── 비밀번호: 틀린 지금 비밀번호는 그 칸에서
  const password = page.getByRole('region', { name: '비밀번호 변경' });
  await password.getByLabel(/^지금 비밀번호/).fill('wrong-pass-00');
  await password.getByLabel(/^새 비밀번호\*/).fill(changed);
  await password.getByLabel(/^새 비밀번호 확인/).fill(changed);
  await password.getByRole('button', { name: '비밀번호 바꾸기' }).click();
  await expect(password.getByText('지금 비밀번호가 맞지 않습니다.')).toBeVisible();
  await expect(password.getByLabel(/^지금 비밀번호/)).toHaveAttribute('aria-invalid', 'true');

  await password.getByLabel(/^지금 비밀번호/).fill(original);
  await password.getByRole('button', { name: '비밀번호 바꾸기' }).click();
  await expect(password.getByRole('status')).toContainText('비밀번호를 바꿨습니다');

  // ── 로그아웃 뒤: 옛 비밀번호는 안 되고 새 비밀번호는 된다
  await page.getByRole('button', { name: '로그아웃' }).click();
  await expect(page.getByRole('link', { name: '로그인' }).first()).toBeVisible();

  await login(page, email, original);
  await expect(page.locator('form [role="alert"]')).toContainText('이메일 또는 비밀번호');

  await login(page, email, changed);
  await expect(page.getByRole('link', { name: '마이페이지' })).toBeVisible();
  await expect(page.getByRole('banner').getByText('바뀐 이름', { exact: true }).locator('visible=true')).toHaveCount(1);
});
