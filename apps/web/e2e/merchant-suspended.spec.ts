import { test, expect } from '@playwright/test';
import { SEED_ACCOUNT, SEED_PASSWORD } from '@shop/auth/seed-fixtures';
import { ready } from './state';
import { expectNoA11yViolations } from './axe';
import { layoutProblems, WIDTHS } from './layout';

/**
 * 정지된 가맹점의 담당자가 보는 것.
 *
 * **어제까지 쓰던 콘솔이 말없이 사라졌다.** 역할은 세션에 실린 채 그대로라 헤더에는 콘솔로 가는 문이 남았고,
 * 눌러 보면 첫 화면으로 튕겼다 — 로그인이 깨진 줄 알고 다시 로그인하게 되는 자리다.
 *
 * 전용 계정을 쓴다(suspendedMerchant, 가맹점 "쉬는가게"). 승인된 가맹점을 정지시켜 보면 그 가맹점을 쓰는
 * 다른 명세가 함께 무너진다.
 */

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await page.goto('/login');
  await ready(page);
  await page.getByLabel('이메일').fill(SEED_ACCOUNT.suspendedMerchant);
  await page.getByLabel('비밀번호').fill(SEED_PASSWORD);
  await page.getByRole('button', { name: '로그인' }).click();
  await expect(page.getByRole('link', { name: '마이페이지' })).toBeVisible({ timeout: 20_000 });
});

test('헤더에 콘솔로 가는 문이 없고, 주소로 가면 까닭을 말해 준다', async ({ page }) => {
  // 역할 뱃지는 콘솔로 가는 문이다 — 지금 상태로 그린다
  await expect(page.getByRole('link', { name: /운영 콘솔|판매자/ })).toHaveCount(0);

  await page.goto('/admin');
  await page.waitForURL(/\/merchant\/suspended$/);
  await ready(page);

  const notice = page.getByRole('region', { name: /쉬는가게 — 일시 정지/ });
  await expect(notice).toBeVisible();
  // 돈과 물건이 사라진 것이 아니라는 말이 먼저다
  await expect(notice).toContainText('주문·상품·정산은 그대로 있고');
  // **까닭이 적힌다.** 처분에는 사유를 받아 왔는데 그 글이 감사 로그에만 남아, 멈춘 쪽은 물어야만 알 수 있었다
  await expect(notice).toContainText('까닭');
  await expect(notice).toContainText('정산 계좌 명의가 사업자와 달라');
  await expect(notice.getByRole('link', { name: '고객센터에 문의하기' })).toHaveAttribute('href', '/support/ask');
});

test('콘솔 안쪽 주소도 같은 안내로 간다 — 화면마다 다른 곳으로 튕기지 않는다', async ({ page }) => {
  await page.goto('/admin/orders');
  await page.waitForURL(/\/merchant\/suspended$/);
  await expect(page.getByRole('heading', { level: 1, name: '가맹점 운영이 멈춰 있습니다' })).toBeVisible();
});

test('손님으로는 그대로 쓴다 — 로그인도 장보기도 막지 않는다', async ({ page }) => {
  await page.goto('/mypage');
  await ready(page);
  expect(new URL(page.url()).pathname).toBe('/mypage');

  await page.goto('/product/oversized-wool-coat');
  await ready(page);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

/**
 * **훑기는 여기서 한다.** a11y-*·layout* 명세는 손님·운영진 세션으로 도는데, 이 화면은 정지된 가맹점의 세션이
 * 아니면 열리지 않는다(다른 사람이 열면 첫 화면으로 보낸다). 그래서 그 목록에서는 빼고 이 자리에서 잰다.
 */
test('읽을 수 있고, 어느 폭에서도 자리가 무너지지 않는다', async ({ page }) => {
  await page.goto('/merchant/suspended');
  await ready(page);
  await expectNoA11yViolations(page);

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    expect(await layoutProblems(page), `${width}px`).toEqual([]);
  }
});
