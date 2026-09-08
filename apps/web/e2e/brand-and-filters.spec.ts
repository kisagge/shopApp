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

  // 조건이 없으면 접혀 있다. 옷 가게에서 먼저 보여야 하는 것은 옷이다.
  await page.locator('summary', { hasText: '상품 좁혀 보기' }).click();

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


test('조건이 없으면 좁혀 보기는 접혀 있다', async ({ page }) => {
  /*
   * 상품이 여덟일 때는 색이 서넛이라 한 줄이었다. 서른넷이 되면서 아우터
   * 한 곳에만 색이 열둘 — 접지 않으면 좁은 화면에서 옷이 접힌 곳 아래로
   * 밀린다.
   */
  await page.goto('/category/outer');

  await expect(page.locator('summary', { hasText: '상품 좁혀 보기' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'L', exact: true })).toBeHidden();
});

test('조건이 걸려 있으면 펼쳐진 채로 온다', async ({ page }) => {
  // 접어 두면 무엇 때문에 목록이 줄었는지 알 수 없다.
  await page.goto('/category/outer?size=L');

  await expect(page.getByRole('checkbox', { name: 'L', exact: true })).toBeVisible();
  await expect(page.getByText('1개 적용 중')).toBeVisible();
});

test('접은 채로 정렬만 바꿔도 조건이 풀리지 않는다', async ({ page }) => {
  /*
   * details 안의 체크박스는 접혀 있어도 폼과 함께 넘어간다 — disabled 가
   * 아니기 때문이다. 여기서 풀린다면 접기를 잘못 만든 것이다.
   */
  await page.goto('/category/outer?size=L');

  await page.locator('summary', { hasText: '상품 좁혀 보기' }).click(); // 접는다
  await expect(page.getByRole('checkbox', { name: 'L', exact: true })).toBeHidden();

  await page.getByLabel('정렬').selectOption('price_asc');
  await page.getByRole('button', { name: '적용' }).click();

  await expect(page).toHaveURL(/size=L/);
  await expect(page).toHaveURL(/sort=price_asc/);
});
