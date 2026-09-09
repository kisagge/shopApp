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

test('가격으로 좁히면 실제 가격과 맞는다', async ({ page }) => {
  /*
   * 이 명세가 없어서 못 봤다. 파는 가격은 `salePrice ?? listPrice` 인
   * 파생 컬럼인데 시드가 그 칸을 안 써서 기본값 0 으로 남았고, 서른넷 중
   * 스물여섯이 `10만원 이상` 에서 통째로 사라졌다. 파는 가격이 0 이니
   * 걸릴 리가 없다.
   *
   * 그래서 **개수가 아니라 화면에 적힌 가격**을 본다. 남은 것이 전부 조건
   * 안에 있는지, 그리고 좁히기 전보다 줄었는지 — 둘 다 봐야 한다. 개수만
   * 보면 0 개도 통과한다.
   */
  const priced = async (url: string) => {
    await page.goto(url);
    await expect(page.locator('#main a[href^="/product/"]').first()).toBeVisible();
    return page.locator('#main [data-price]').evaluateAll((els) =>
      els.map((e) => Number((e as HTMLElement).dataset['price'])),
    );
  };

  const all = await priced('/category/outer');
  expect(all.length).toBeGreaterThan(1);

  const min = 200_000;
  const above = await priced(`/category/outer?minPrice=${min}`);

  expect(above.length).toBeGreaterThan(0);
  expect(above.length).toBeLessThan(all.length);
  expect(above.every((p) => p >= min)).toBe(true);
  // 조건에 맞는데 빠진 것이 없어야 한다 — 파는 가격이 0 으로 남으면 여기서 걸린다
  expect(above.length).toBe(all.filter((p) => p >= min).length);
});

test('칩을 전부 눌러도 조건이 사라지지 않는다', async ({ page }) => {
  /*
   * 상한이 10 이던 시절, 상품이 서른넷이 되면서 검색 화면에 사이즈 칩이
   * 열둘 떴다. 전부 누르면 계약이 넘친다며 고른 것을 **통째로 버렸고**,
   * 화면은 조건 없는 목록과 빈 체크박스로 돌아왔다. 누른 사람에게는 아무
   * 일도 일어나지 않은 것으로 보인다.
   *
   * 단위 검사로는 못 봤다. 매대가 상한보다 많은 값을 내놓아야 생기는
   * 일이라, 진짜 매대를 눌러 봐야 드러난다.
   */
  await page.goto('/search?q=울');

  await page.locator('summary', { hasText: '상품 좁혀 보기' }).click();
  const chips = page.locator('label:has(input[name="size"])');
  const count = await chips.count();
  expect(count).toBeGreaterThan(10); // 상한을 넘겨야 이 명세가 뜻을 가진다

  for (let i = 0; i < count; i += 1) await chips.nth(i).click();
  await page.getByRole('button', { name: '적용' }).click();

  await expect(page.getByRole('checkbox', { name: 'M', exact: true })).toBeChecked();
  expect(await page.locator('input[name="size"]:checked').count()).toBe(count);
});

test('카테고리 안에서 브랜드로 좁힌다', async ({ page }) => {
  /*
   * 브랜드 화면(/brand/[slug])은 있었지만, **카테고리 안에서 브랜드를 고르는
   * 길은 없었다.** 아우터를 보다가 한 브랜드만 보려면 브랜드 화면으로 나갔다가
   * 거기서 다시 아우터를 찾아야 했다.
   */
  await page.goto('/category/outer');
  const all = await page.locator('#main a[href^="/product/"]').count();
  expect(all).toBeGreaterThan(1);

  await page.locator('summary', { hasText: '상품 좁혀 보기' }).click();
  const chips = page.locator('label:has(input[name="brand"])');
  expect(await chips.count(), '아우터에는 브랜드가 둘 이상 있어야 이 명세가 성립한다')
    .toBeGreaterThan(1);

  const picked = (await chips.first().textContent())!.trim();
  await chips.first().click();
  await page.getByRole('button', { name: '적용' }).click();

  await expect(page).toHaveURL(/brand=/);
  const left = await page.locator('#main a[href^="/product/"]').count();
  expect(left).toBeGreaterThan(0);
  expect(left).toBeLessThan(all);

  /*
   * **남은 카드가 전부 그 브랜드여야 한다.** 개수만 보면 엉뚱한 이유로
   * 줄어도 통과한다. 카드마다 첫 줄이 브랜드다.
   */
  const brands = await page
    .getByRole('region', { name: '상품 목록' })
    .locator('li[data-product-id]')
    .evaluateAll((cards) => cards.map((c) => c.querySelector('p')?.textContent?.trim() ?? ''));

  expect(brands.length).toBe(left);
  expect(brands.every((b) => b === picked)).toBe(true);
});

test('브랜드 화면에는 브랜드 축이 없다', async ({ page }) => {
  // 이미 주소로 정해진 것을 그 안에서 또 고르는 것은 뜻이 없다
  await page.goto('/brand/studio-noon');
  await page.locator('summary', { hasText: '상품 좁혀 보기' }).click();
  await expect(page.locator('input[name="brand"]')).toHaveCount(0);
});

test('고를 수 있는 브랜드는 그 매대에 물건이 있는 것뿐이다', async ({ page }) => {
  /*
   * 없는 브랜드를 띄우면 누른 사람은 빈 화면을 만난다 — 색·사이즈에 걸어 둔
   * 규칙과 같다.
   */
  const shown = async (path: string) => {
    await page.goto(path);
    await page.locator('summary', { hasText: '상품 좁혀 보기' }).click();
    return page
      .locator('input[name="brand"]')
      .evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  };

  /*
   * **좁은 매대와 넓은 매대를 견준다.** 큰 카테고리끼리 견주면 넷 다 물건이
   * 있어 목록이 같게 나오고, 그러면 이 검사가 아무것도 안 지킨다 — 실제로
   * 아우터와 슈즈로 썼다가 그랬다.
   */
  const wide = await shown('/category/outer');
  const narrow = await shown('/category/outer-jacket');

  expect(narrow.length).toBeGreaterThan(0);
  expect(narrow.length).toBeLessThan(wide.length);
  // 좁은 쪽의 브랜드는 넓은 쪽에도 다 있어야 한다
  expect(narrow.every((slug) => wide.includes(slug))).toBe(true);
});

test('가격을 비워 둔 채 적용해도 매대가 남는다', async ({ page }) => {
  /*
   * **여기가 통째로 무너져 있었다.** 가격 칸은 비어 있는 채로 폼과 함께
   * 넘어가는데, 빈 문자열이 0 으로 바뀌어 `maxPrice=0` 이 됐다. 그러면
   * 0원 이하인 상품만 남아 매대가 빈다 — 색 하나 고르고 적용을 누르는
   * 가장 흔한 동선이 정확히 이 자리였다.
   *
   * 단위 검사는 계약이 빈 칸을 어떻게 읽는지 본다. 여기서는 **사람이 하는
   * 그대로** 눌러 본다 — 폼이 무엇을 보내는지까지 함께 걸리는 자리다.
   */
  await page.goto('/category/outer');
  const before = await page.locator('#main a[href^="/product/"]').count();
  expect(before).toBeGreaterThan(1);

  await page.locator('summary', { hasText: '상품 좁혀 보기' }).click();
  await page.getByRole('button', { name: '적용' }).click();

  await expect(page.locator('#main a[href^="/product/"]').first()).toBeVisible();
  expect(await page.locator('#main a[href^="/product/"]').count()).toBe(before);
});

test('가격 구간을 한 번 눌러 좁힌다', async ({ page }) => {
  /*
   * 숫자 두 칸만 두면 "10만원 아래로 보고 싶다" 는 흔한 일이 칸 찾기·
   * 타이핑·적용 세 걸음이었다. 한 번 누르면 끝나야 하는 종류다.
   */
  await page.goto('/category/outer');
  const all = await page.locator('#main a[href^="/product/"]').count();

  await page.locator('summary', { hasText: '상품 좁혀 보기' }).click();
  /*
   * 라디오는 sr-only 라 라벨이 클릭을 받는다 — 눈에 보이는 것도 칩이고
   * 사람이 누르는 것도 칩이다. 색·사이즈 칩과 같은 방식이다.
   */
  await page.locator('label:has(input[name="price"][value="under-100k"])').click();
  await page.getByRole('button', { name: '적용' }).click();

  await expect(page).toHaveURL(/price=under-100k/);
  const left = await page.locator('#main a[href^="/product/"]').count();
  expect(left).toBeGreaterThan(0);
  expect(left).toBeLessThan(all);

  // 눌린 칩이 남아 있어야 지금 무엇으로 좁혔는지 알 수 있다
  await expect(page.getByRole('radio', { name: '10만원 이하' })).toBeChecked();
  // 구간에서 편 경계를 칸에 채우지 않는다 — 채우면 다음 적용에서 그 값이 이긴다
  await expect(page.getByLabel('최소 가격')).toHaveValue('');
  await expect(page.getByLabel('최대 가격')).toHaveValue('');
});

test('구간을 다 더하면 매대 전체가 된다', async ({ page }) => {
  /*
   * 칸 사이가 벌어지면 그 값의 상품은 어느 칩으로도 못 찾고, 겹치면 같은
   * 상품이 두 칩에 나온다. **core 의 단위 검사는 경계 숫자만 본다** —
   * 여기서는 진짜 매대를 네 번 세어 합이 맞는지 본다.
   */
  const count = async (query: string) => {
    await page.goto(`/category/outer${query}`);
    return page.locator('#main a[href^="/product/"]').count();
  };

  const all = await count('');
  const parts = [];
  for (const id of ['under-100k', '100k-200k', '200k-300k', 'over-300k']) {
    parts.push(await count(`?price=${id}`));
  }

  expect(parts.reduce((a, b) => a + b, 0)).toBe(all);
});

test('손으로 친 숫자가 구간을 이긴다', async ({ page }) => {
  // 눌린 칩과 다른 범위가 걸려 있으면 화면이 거짓말을 한다
  await page.goto('/category/outer?price=under-100k&minPrice=300000');

  /*
   * 여기서 summary 를 누르면 안 된다. 조건이 걸려 있으면 좁혀 보기는 이미
   * 펼쳐진 채로 오므로, 누르는 것은 **접는 것**이 된다 — 그러면 칩이 사라져
   * "못 찾았다" 로 진다. 실제로 그렇게 한 번 졌다.
   */
  await expect(page.getByRole('radio', { name: '10만원 이하' })).not.toBeChecked();
  await expect(page.getByRole('radio', { name: '전체' })).toBeChecked();
  await expect(page.getByLabel('최소 가격')).toHaveValue('300000');
});
