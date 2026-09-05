import { test, expect } from '@playwright/test';

/**
 * 브랜드 화면과 색상·사이즈 필터.
 *
 * 둘 다 **데이터에는 이미 있었는데 화면에서 갈 길이 없던 것**이다.
 * 자동완성은 브랜드를 제안하면서 검색 결과로 보냈고, 필터는 가격뿐이었다.
 */

test('브랜드 이름을 누르면 그 브랜드 화면으로 간다', async ({ page }) => {
  await page.goto('/');
  const href = (await page.locator('#main a[href^="/product/"]').first().getAttribute('href'))!;
  await page.goto(href);

  /*
   * 예전에는 브랜드 이름이 **카테고리로** 갔다. 이름은 브랜드인데 데려가는
   * 곳이 갈래라, 누른 사람이 기대한 것과 다른 화면이 나왔다.
   */
  const brandLink = page.locator('#main a[href^="/brand/"]').first();
  await expect(brandLink).toBeVisible();
  const brandName = (await brandLink.textContent())!.trim();

  await brandLink.click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(brandName);
  await expect(page.locator('#main a[href^="/product/"]').first()).toBeVisible();
});

test('없는 브랜드는 404 다', async ({ page }) => {
  const response = await page.goto('/brand/nothing-here');
  expect(response?.status()).toBe(404);
});

test('자동완성의 브랜드는 검색이 아니라 브랜드 화면으로 보낸다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');

  const box = page.locator('#site-search');
  await expect
    .poll(async () => {
      await box.fill('STUDI');
      await box.fill('STUDIO');
      return box.getAttribute('aria-expanded');
    })
    .toBe('true');

  const brandOption = page.getByRole('option').filter({ hasText: '브랜드' }).first();
  await expect(brandOption).toBeVisible();
  await brandOption.click();

  await expect(page).toHaveURL(/\/brand\//);
});

test('색상·사이즈로 좁힐 수 있고, 고른 것이 주소에 남는다', async ({ page }) => {
  await page.goto('/category/outer');

  // count() 는 기다리지 않는다 — 먼저 하나가 보이는 것을 확인하고 센다
  await expect(page.locator('#main a[href^="/product/"]').first()).toBeVisible();
  expect(await page.locator('#main a[href^="/product/"]').count()).toBeGreaterThan(1);

  /*
   * 체크박스는 label 안에 sr-only 로 들어 있다 — 눈에 보이는 것은 칩이고,
   * 사람이 누르는 것도 칩이다. 그래서 label 을 누른다.
   */
  await page.locator('label:has(input[name="size"][value="L"])').click();
  await page.getByRole('button', { name: '적용' }).click();

  // 조건이 주소에 남아야 공유하고 뒤로 갈 수 있다
  await expect(page).toHaveURL(/size=L/);
  await expect(page.getByRole('checkbox', { name: 'L', exact: true })).toBeChecked();
});

test('고를 수 있는 값은 그 화면에 실제로 있는 것뿐이다', async ({ page }) => {
  /*
   * 니트 화면에 "28" 같은 청바지 사이즈를 띄우면 누른 사람은 빈 화면을
   * 만난다 — 눌렀더니 아무것도 없는 것이 이 기능에서 가장 나쁜 상태다.
   */
  await page.goto('/category/knit');
  const knitSizes = await page.locator('input[name="size"]').evaluateAll((els) =>
    els.map((e) => (e as HTMLInputElement).value),
  );

  await page.goto('/category/pants');
  const pantsSizes = await page.locator('input[name="size"]').evaluateAll((els) =>
    els.map((e) => (e as HTMLInputElement).value),
  );

  expect(knitSizes.length).toBeGreaterThan(0);
  expect(pantsSizes.length).toBeGreaterThan(0);
  // 같은 목록이면 범위를 따르지 않는다는 뜻이다
  expect(new Set(knitSizes)).not.toEqual(new Set(pantsSizes));
});

test('자바스크립트 없이도 좁혀진다 — 평범한 GET 폼이다', async ({ page }) => {
  await page.goto('/category/pants?size=28');

  await expect(page.getByRole('checkbox', { name: '28', exact: true })).toBeChecked();
  await expect(page.locator('#main a[href^="/product/"]').first()).toBeVisible();
});
