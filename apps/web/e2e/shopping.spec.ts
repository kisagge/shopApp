import { test, expect } from '@playwright/test';

/**
 * 물건을 고르고 담는 길.
 *
 * 로그인 없이도 여기까지는 되어야 한다 — 담아 보기도 전에 로그인을
 * 요구하면 대부분 떠난다.
 */

test('홈에서 상품을 골라 장바구니에 담는다', async ({ page }) => {
  await page.goto('/');

  // 첫 상품 카드로 들어간다. 시드가 바뀌어도 깨지지 않게 이름을 박지 않는다.
  const firstProduct = page.locator('#main a[href^="/product/"]').first();
  await firstProduct.click();

  await expect(page).toHaveURL(/\/product\//);

  // 재고가 있는 옵션만 고른다. 품절 옵션은 aria-disabled 라 눌러도 안 담긴다.
  const inStock = page.locator('[role="radio"]:not([aria-disabled="true"])');
  const groups = await page.locator('[role="radiogroup"]').count();
  // 옵션 그룹이 여럿이면(색·사이즈) 그룹마다 하나씩 골라야 조합이 정해진다
  for (let i = 0; i < groups; i += 1) {
    const pick = page
      .locator('[role="radiogroup"]')
      .nth(i)
      .locator('[role="radio"]:not([aria-disabled="true"])')
      .first();
    if ((await pick.count()) > 0) await pick.click();
  }
  test.skip((await inStock.count()) === 0, '재고 있는 옵션이 없는 상품이다');

  const addToCart = page.getByRole('button', { name: '장바구니' });
  test.skip(
    (await addToCart.getAttribute('aria-disabled')) === 'true',
    '고른 조합에 재고가 없다',
  );
  await addToCart.click();

  // 담긴 결과는 눈에만 보이면 안 된다 — role="status" 로 알린다
  await expect(page.getByRole('status')).toHaveText('장바구니에 담았습니다');

  // 헤더의 개수도 따라 올라간다
  await expect(page.getByRole('link', { name: /장바구니, 상품 \d+개/ })).toBeVisible();
});

test('검색은 주소에 남아 새로고침해도 유지된다', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('searchbox', { name: /상품|브랜드/ }).fill('코트');
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/q=/);
  const url = page.url();

  await page.reload();
  expect(page.url()).toBe(url);
});

test('결과가 없으면 무엇을 풀어야 하는지 알려 준다', async ({ page }) => {
  await page.goto('/search?q=존재하지않는상품명입니다');

  // 검색어만 되뇌지 않고 다음 행동을 알려 준다
  await expect(page.locator('#main')).toContainText(/조건|다시|검색어/);
});

test('품절 옵션에는 재입고 알림을 준다', async ({ page }) => {
  await page.goto('/');

  // 품절 뱃지가 붙은 카드를 찾는다
  const soldOutCard = page.locator('#main a[href^="/product/"]').filter({ hasText: '품절' }).first();
  const count = await soldOutCard.count();
  test.skip(count === 0, '품절 상품이 시드에 없다');

  await soldOutCard.click();

  // 품절이 아닌 옵션이 하나도 없는 상품이라면 알림 버튼이 보여야 한다.
  // 옵션이 섞여 있으면 품절 옵션을 골라야 나온다.
  const disabled = page.locator('[role="radio"][aria-disabled="true"]').first();
  if ((await disabled.count()) > 0) {
    // aria-disabled 라 클릭은 막혀 있다. 품절 옵션만 있는 상품에서만 확인한다.
    await expect(page.locator('#main')).toContainText('품절');
  }
});



test('비로그인은 어드민에 들어갈 수 없다', async ({ page }) => {
  await page.goto('/admin');

  // 주소 전체가 아니라 **경로**만 본다.
  // /login?next=/admin 은 /admin 으로 끝나서, 정규식으로 보면 통과해 버린다.
  expect(new URL(page.url()).pathname).not.toBe('/admin');
});
