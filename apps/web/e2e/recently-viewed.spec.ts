import { test, expect } from '@playwright/test';

/**
 * 최근 본 상품.
 *
 * 기기에만 남는 목록이라 **로그인 없이** 확인한다 — 그것이 이 기능이
 * 놓인 자리이기도 하다.
 */

const strip = 'section[aria-labelledby="recent-heading"]';

test('처음 온 사람에게는 이 줄이 아예 없다', async ({ page }) => {
  await page.goto('/');
  // 빈 상자에 "아직 없습니다" 를 띄우면 화면만 길어진다
  await expect(page.locator(strip)).toHaveCount(0);
});

test('본 상품이 다음 화면에 최근 순으로 쌓인다', async ({ page }) => {
  await page.goto('/');

  // 시드가 바뀌어도 깨지지 않게 이름을 박지 않는다
  const cards = page.locator('#main a[href^="/product/"]');
  const first = (await cards.nth(0).getAttribute('href'))!;
  const second = (await cards.nth(1).getAttribute('href'))!;

  await page.goto(first);
  await page.goto(second);
  await page.goto('/');

  const links = page.locator(`${strip} a[href^="/product/"]`);
  // 나중에 본 것이 앞이다
  await expect(links.nth(0)).toHaveAttribute('href', second);
  await expect(links.nth(1)).toHaveAttribute('href', first);
});

test('보고 있는 상품은 최근 본 목록에 넣지 않는다', async ({ page }) => {
  await page.goto('/');
  const cards = page.locator('#main a[href^="/product/"]');
  const first = (await cards.nth(0).getAttribute('href'))!;
  const second = (await cards.nth(1).getAttribute('href'))!;

  await page.goto(first);
  await page.goto(second);

  // 지금 보고 있는 상품이 "최근 본" 에 또 있을 이유가 없다
  await expect(page.locator(`${strip} a[href="${second}"]`)).toHaveCount(0);
  await expect(page.locator(`${strip} a[href="${first}"]`)).toBeVisible();
});

test('지우면 사라지고, 지웠다고 말로도 알린다', async ({ page }) => {
  await page.goto('/');
  const first = (await page.locator('#main a[href^="/product/"]').first().getAttribute('href'))!;
  await page.goto(first);
  await page.goto('/');

  await expect(page.locator(strip)).toBeVisible();

  await page.getByRole('button', { name: '기록 지우기' }).click();

  // 사라지는 것은 눈으로만 보인다 — 낭독기에게는 말로 알려야 한다
  await expect(page.getByRole('status').filter({ hasText: /./ })).toHaveText(
    '최근 본 상품을 지웠습니다',
  );
  await expect(page.locator(strip)).toHaveCount(0);

  // 새로고침해도 지워진 채다
  await page.reload();
  await expect(page.locator(strip)).toHaveCount(0);
});
