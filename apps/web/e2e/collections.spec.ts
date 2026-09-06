import { test, expect } from '@playwright/test';
import { ready } from './state';

/**
 * 기획전.
 *
 * **배너가 데려갈 곳이 카테고리뿐이던 자리**를 메운 기능이라, 여기서 볼 것은
 * 링크가 실제로 이어지는가다. 화면 하나가 예쁘게 나오는 것은 그 다음이다.
 */

test('홈에서 기획전으로 데려간다', async ({ page }) => {
  /*
   * 배너는 시드가 만들지 않아 CI 에는 없다 — 그래서 배너 버튼만 짚지 않고
   * **홈에서 기획전으로 가는 길이 있는가**를 본다. 배너가 있으면 그 버튼이,
   * 없으면 기획전 줄이 그 길이다.
   */
  await page.goto('/');

  const door = page.locator('a[href^="/collection/"]').first();
  await expect(door).toBeVisible();
  const href = (await door.getAttribute('href'))!;

  await door.click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
  // 데려간 곳에 상품이 있어야 데려간 뜻이 있다
  await expect(page.locator('#main a[href^="/product/"]').first()).toBeVisible();
});

test('기획전 목록에서 하나를 열 수 있다', async ({ page }) => {
  await page.goto('/collections');

  // 화면의 주제는 하나다. 카드 제목이 h1 이 되면 낭독기에는 주제가 여럿으로 들린다.
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  const first = page.locator('a[href^="/collection/"]').first();
  await first.click();

  await expect(page.locator('#main a[href^="/product/"]').first()).toBeVisible();
});

test('없는 기획전은 404 다 — 끝난 주소가 살아 있는 것처럼 보이면 안 된다', async ({ page }) => {
  const response = await page.goto('/collection/nothing-here');
  expect(response?.status()).toBe(404);
});

test('헤더에서 기획전으로 갈 수 있다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await ready(page);

  await page.locator('header a[href="/collections"]:visible').click();
  await expect(page).toHaveURL(/\/collections$/);
});

test('사이트맵에는 열려 있는 기획전만 들어간다', async ({ page }) => {
  const response = await page.request.get('/sitemap.xml');
  const xml = await response.text();

  const listed = [...xml.matchAll(/<loc>[^<]*\/collection\/([a-z0-9-]+)<\/loc>/g)].map((m) => m[1]!);
  expect(listed.length).toBeGreaterThan(0);

  // 사이트맵에 적힌 주소는 전부 열려야 한다 — 검색에서 들어왔더니 404 면
  // 사이트맵을 통째로 의심받는다
  for (const slug of listed) {
    const page404 = await page.request.get(`/collection/${slug}`);
    expect(page404.status(), slug).toBe(200);
  }
});
