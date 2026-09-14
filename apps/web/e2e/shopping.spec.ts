import { test, expect } from '@playwright/test';
import { ready } from './state';

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

  // 재고가 있는 옵션만 고른다. 품절 옵션은 골라도 담기 대신 재입고 알림이 뜬다.
  const inStock = page.locator('[role="radio"]:not([data-sold-out])');
  const groups = await page.locator('[role="radiogroup"]').count();
  // 옵션 그룹이 여럿이면(색·사이즈) 그룹마다 하나씩 골라야 조합이 정해진다
  for (let i = 0; i < groups; i += 1) {
    const pick = page
      .locator('[role="radiogroup"]')
      .nth(i)
      .locator('[role="radio"]:not([data-sold-out])')
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

  /*
   * 담긴 결과는 눈에만 보이면 안 된다 — role="status" 로 알린다.
   *
   * 글이 든 알림만 고른다. 이 화면에는 최근 본 상품이 쓰는 **비어 있는**
   * 알림 자리도 함께 있다 — 그쪽은 지웠을 때만 글이 생기고, 미리 자리를
   * 잡아 두지 않으면 낭독기가 그 글을 놓친다.
   */
  await expect(page.getByRole('status').filter({ hasText: /./ })).toHaveText(
    '장바구니에 담았습니다',
  );

  // 헤더의 개수도 따라 올라간다
  await expect(page.getByRole('link', { name: /장바구니, 상품 \d+개/ })).toBeVisible();
});

test('검색은 주소에 남아 새로고침해도 유지된다', async ({ page }) => {
  await page.goto('/');
  await ready(page);

  // 자동완성이 붙으면서 searchbox 가 아니라 combobox 가 됐다 — 규격대로다
  await page.getByRole('combobox', { name: /상품|브랜드/ }).fill('코트');
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/q=/);
  const url = page.url();

  await page.reload();
  expect(page.url()).toBe(url);
});

test('검색이 실제로 찾아 준다', async ({ page }) => {
  /*
   * **결과를 확인한다.** 예전에는 주소만 보고 넘어갔는데, 그 사이 시드가
   * 검색용 칸을 비워 두어 **갓 시드한 DB 에서는 검색이 아무것도 못 찾고
   * 있었다.** 화면은 "결과가 없습니다" 를 멀쩡히 보여 주므로 눈으로는
   * 고장인지 알 수 없다.
   */
  await page.goto('/search?q=코트');

  await expect(page.locator('#main a[href^="/product/"]').first()).toBeVisible();
  await expect(page.locator('#main')).toContainText('코트');
});

test('브랜드 이름으로도 찾는다 — 브랜드명을 상품 행에 복사해 두는 이유다', async ({ page }) => {
  await page.goto('/search?q=STUDIO');
  await expect(page.locator('#main a[href^="/product/"]').first()).toBeVisible();
});

test('낱말이 떨어져 있어도 찾는다', async ({ page }) => {
  /*
   * **"울 코트" 가 0건이었다.** 검색어 전체를 한 덩어리로 보고 그 문자열이
   * 통째로 들어 있는지만 봤기 때문이다 — "오버사이즈 울 블렌드 코트" 안에
   * 두 낱말이 다 있는데 사이에 "블렌드" 가 끼어 있었다. 한국어로 물건을 찾을
   * 때 아주 자연스러운 말이 0건이면 손님은 안 파는 물건이라고 읽는다.
   */
  await page.goto('/search?q=' + encodeURIComponent('울 코트'));
  await expect(page.locator('#main a[href^="/product/"]').first()).toBeVisible();

  // 순서를 바꿔도 같은 것을 찾아야 한다 — 낱말에는 순서가 없다
  await page.goto('/search?q=' + encodeURIComponent('코트 울'));
  await expect(page.locator('#main a[href^="/product/"]').first()).toBeVisible();
});

test('낱말을 더하면 좁혀진다 — 넓어지지 않는다', async ({ page }) => {
  /*
   * 하나라도 걸리면 내놓는 방식(OR)으로 쪼개면 낱말을 더할수록 결과가
   * 늘어난다. 좁히려고 더한 것인데 반대로 도는 셈이다.
   */
  const count = async (q: string) => {
    await page.goto('/search?q=' + encodeURIComponent(q));
    /*
     * **그려질 때까지 기다린 뒤에 센다.** 곧바로 세면 0 이 나오고, 0 은
     * "좁혀졌다" 로 읽혀 조용히 통과한다 — 실제로 매대가 커지면서 한 번
     * 그렇게 졌다.
     */
    await expect(page.locator('#main a[href^="/product/"]').first()).toBeVisible();
    return page.locator('#main a[href^="/product/"]').count();
  };

  const wide = await count('코트');
  const narrow = await count('울 코트');
  expect(wide, '검색이 아무것도 못 찾고 있다').toBeGreaterThan(0);
  expect(narrow, '낱말을 더했는데 결과가 늘었다').toBeLessThanOrEqual(wide);
  expect(narrow).toBeGreaterThan(0);
});

test('브랜드 칩도 같은 조건으로 좁혀진다', async ({ page }) => {
  /*
   * 목록·자동완성·색과 사이즈 칩·브랜드 칩이 각자 조건을 들고 있었다.
   * 하나만 고치면 상품은 나오는데 그 옆 칩은 비는 식으로 화면이 스스로
   * 어긋난다.
   */
  await page.goto('/search?q=' + encodeURIComponent('울 코트'));
  await expect(page.locator('#main a[href^="/product/"]').first()).toBeVisible();

  await page.getByText('상품 좁혀 보기').click();
  // 결과가 있는 검색에서 좁힐 거리가 하나도 없으면 조건이 어긋난 것이다
  await expect(page.locator('#main')).toContainText(/브랜드|색|사이즈/);
});

test('"더 보기" 가 다음 쪽을 가져오고, 조건을 그대로 들고 간다', async ({ page }) => {
  /*
   * **이 자리는 오랫동안 밟을 수 없었다.** 한 쪽이 24개인데 가장 큰 목록이
   * 13개라 "더 보기" 가 화면에 아예 안 나왔다. 그래서 거기 있던 결함 —
   * 색·사이즈·브랜드 필터를 안 들고 가던 것 — 도 여태 안 보였다.
   * 아우터를 26개로 올려 길을 냈다.
   */
  const slugs = async () =>
    (await page.locator('#main a[href^="/product/"]').evaluateAll((links) =>
      links.map((l) => l.getAttribute('href')),
    )).filter((h): h is string => h !== null);

  await page.goto('/category/outer?sort=price_asc');
  const first = new Set(await slugs());
  expect(first.size, '한 쪽이 다 안 찼으면 더 보기가 나올 수 없다').toBe(24);

  const more = page.getByRole('link', { name: /더 보기|더보기|more/i });
  await expect(more).toBeVisible();

  // 조건이 주소에 실려 있어야 다음 쪽도 같은 목록이다
  const href = await more.getAttribute('href');
  expect(href, '더 보기가 정렬을 흘린다').toContain('sort=price_asc');

  await more.click();
  await page.waitForURL(/cursor=/);

  const second = await slugs();
  expect(second.length, '다음 쪽이 비었다').toBeGreaterThan(0);
  // 같은 상품을 두 번 보여 주면 커서가 제자리를 못 잡은 것이다
  for (const slug of second) {
    expect(first.has(slug), `${slug} 가 두 쪽에 다 나온다`).toBe(false);
  }
});

test('결과가 없으면 무엇을 풀어야 하는지 알려 준다', async ({ page }) => {
  await page.goto('/search?q=존재하지않는상품명입니다');

  // 검색어만 되뇌지 않고 다음 행동을 알려 준다
  await expect(page.locator('#main')).toContainText(/조건|다시|검색어/);
});

test('비로그인은 어드민에 들어갈 수 없다', async ({ page }) => {
  await page.goto('/admin');

  // 주소 전체가 아니라 **경로**만 본다.
  // /login?next=/admin 은 /admin 으로 끝나서, 정규식으로 보면 통과해 버린다.
  expect(new URL(page.url()).pathname).not.toBe('/admin');
});

test('상품 문의는 사기 전에 물어볼 자리다', async ({ page }) => {
  await page.goto('/product/short-padding-blouson');

  const section = page.getByRole('heading', { name: /상품 문의/ });
  await expect(section).toBeVisible();

  // 로그인하지 않았으면 양식 대신 안내가 나와야 한다
  await expect(page.getByText(/로그인 후 남기실 수 있습니다/)).toBeVisible();
});
