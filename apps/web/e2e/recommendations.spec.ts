import { test, expect } from '@playwright/test';

/**
 * 추천 줄.
 *
 * **첫날에도 비어 있지 않아야 한다** — 그것이 이 기능에서 가장 손이 많이
 * 간 부분이다. 함께 본 기록은 사람이 다녀가야 쌓이므로, 기록이 없는 상품에
 * 서도 줄이 나오는지 확인한다.
 */

const strip = 'section[aria-labelledby="rec-heading"]';

test('모든 상품에 추천 줄이 있다', async ({ page }) => {
  await page.goto('/');
  /*
   * **홈은 조각마다 흘러온다.** 격자는 자기 조회가 끝난 뒤에 오므로, 바로 읽으면 빈 손이다
   * (첫 바이트를 데이터에 묶어 두지 않으려고 그렇게 바꿨다 — 홈의 스트리밍 경계).
   * 여기서 보는 것은 추천 줄이지 홈이 언제 차는가가 아니다. 들어올 때까지 기다린다.
   */
  await page.locator('#main a[href^="/product/"]').first().waitFor();

  const hrefs = await page.locator('#main a[href^="/product/"]').evaluateAll((els) =>
    [...new Set(els.map((e) => (e as HTMLAnchorElement).getAttribute('href')!))].slice(0, 4),
  );
  expect(hrefs.length).toBeGreaterThan(2);

  for (const href of hrefs) {
    await page.goto(href);
    await expect(page.locator(strip), href).toBeVisible();
    // 한두 개만 뜨는 줄은 추천이 아니라 빈자리처럼 보인다
    const count = await page.locator(`${strip} a[href^="/product/"]`).count();
    expect(count, href).toBeGreaterThanOrEqual(3);
  }
});

test('보고 있는 상품은 추천하지 않는다', async ({ page }) => {
  await page.goto('/');
  const href = (await page.locator('#main a[href^="/product/"]').first().getAttribute('href'))!;

  await page.goto(href);

  await expect(page.locator(`${strip} a[href="${href}"]`)).toHaveCount(0);
});

test('제목은 근거를 말한다', async ({ page }) => {
  await page.goto('/');
  const href = (await page.locator('#main a[href^="/product/"]').first().getAttribute('href'))!;
  await page.goto(href);

  /*
   * 기록이 있으면 "함께 본 상품", 없으면 "이런 상품은 어떠세요" 다.
   * 인기 상품으로 채운 줄에 "함께 본" 이라고 적으면 사실이 아니다.
   */
  await expect(page.locator(`${strip} h2`)).toHaveText(/함께 본 상품|이런 상품은 어떠세요/);
});
