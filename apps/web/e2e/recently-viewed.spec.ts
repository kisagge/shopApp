import { test, expect } from '@playwright/test';

/**
 * 최근 본 상품.
 *
 * 기기에만 남는 목록이라 **로그인 없이** 확인한다 — 그것이 이 기능이
 * 놓인 자리이기도 하다.
 */

const strip = 'section[aria-labelledby="recent-heading"]';

/** 스토어가 쓰는 열쇠. 값이 여기 들어와야 기록된 것이다. */
const STORE_KEY = 'shop.recently-viewed';

/**
 * 상품을 보고, **기록이 남는 것까지 기다린다.**
 *
 * 기록은 화면이 하이드레이트된 뒤 이펙트에서 일어난다. goto 가 돌아왔다고
 * 곧바로 다음 화면으로 가면 그 사이에 떠나 버려서 아무것도 남지 않는다 —
 * 빠른 기계에서는 늘 통과하고 CI 에서만 진다. 실제로 그렇게 한 번 깨졌다.
 */
async function visitProduct(page: import('@playwright/test').Page, href: string): Promise<void> {
  await page.goto(href);
  const slug = href.split('/').pop()!;
  await page.waitForFunction(
    ([key, needle]) => (localStorage.getItem(key) ?? '').includes(needle),
    [STORE_KEY, slug] as [string, string],
  );
}

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

  await visitProduct(page, first);
  await visitProduct(page, second);
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

  await visitProduct(page, first);
  await visitProduct(page, second);

  // 지금 보고 있는 상품이 "최근 본" 에 또 있을 이유가 없다
  await expect(page.locator(`${strip} a[href="${second}"]`)).toHaveCount(0);
  await expect(page.locator(`${strip} a[href="${first}"]`)).toBeVisible();
});

test('지우면 사라지고, 지웠다고 말로도 알린다', async ({ page }) => {
  await page.goto('/');
  const first = (await page.locator('#main a[href^="/product/"]').first().getAttribute('href'))!;
  await visitProduct(page, first);
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
