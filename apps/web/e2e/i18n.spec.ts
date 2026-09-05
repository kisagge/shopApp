import { test, expect } from '@playwright/test';

/**
 * 언어.
 *
 * 웹은 브라우저 언어, 앱은 기기 언어를 따르는데 **둘 다 Accept-Language 로
 * 온다** — 웹뷰가 기기 언어를 그 헤더에 실어 보낸다. 그래서 여기서 브라우저
 * 언어를 바꿔 보는 것으로 앱 쪽 동작까지 같이 확인된다.
 */

test.describe('브라우저 언어를 따른다', () => {
  test.use({ locale: 'ja-JP' });

  test('일본어 브라우저에는 일본어로 나온다', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('html')).toHaveAttribute('lang', 'ja-JP');
    await expect(page.getByRole('link', { name: 'カート' })).toBeVisible();
  });
});

test.describe('영어 브라우저', () => {
  test.use({ locale: 'en-US' });

  test('카테고리 이름까지 영어로 부른다', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
    // DB 에는 '아우터' 로 들어 있다. 닫힌 목록이라 이름을 옮겨 준다.
    await expect(
      page.getByRole('navigation', { name: 'Main categories' }).getByText('Outerwear'),
    ).toBeVisible();
  });
});

test('고른 언어가 브라우저 설정을 이긴다', async ({ page }) => {
  // 기본 locale 은 ko-KR 이다 (playwright.config)
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko-KR');

  await page.getByRole('form', { name: '언어 선택' }).getByRole('button', { name: '日本語' }).click();

  await expect(page.locator('html')).toHaveAttribute('lang', 'ja-JP');

  // 다른 화면으로 옮겨도 유지된다 — 쿠키에 남았다는 뜻이다
  await page.goto('/cart');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja-JP');
});

test('언어를 바꿔도 보던 검색 결과를 잃지 않는다', async ({ page }) => {
  await page.goto('/search?q=코트');

  await page.getByRole('form', { name: '언어 선택' }).getByRole('button', { name: 'English' }).click();

  await expect(page).toHaveURL(/\/search\?q=/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
});

test('없는 주소도 그 사람의 말로 알려 준다', async ({ page }) => {
  /*
   * 이 파일이 없으면 Next 의 기본 화면이 나온다 — 세 나라 말로 화면을 다
   * 옮겨 놓고 여기만 영어로 남는다. 헤더·푸터는 레이아웃이 그려 주니
   * 그 사이만 영어인, 더 이상한 상태가 된다.
   */
  const cases = [
    { locale: 'ko-KR', text: '없는 주소입니다' },
    { locale: 'en-US', text: 'This page does not exist' },
    { locale: 'ja-JP', text: '存在しないページです' },
  ];

  for (const { locale, text } of cases) {
    const context = await page.context().browser()!.newContext({ locale });
    const fresh = await context.newPage();

    const response = await fresh.goto('/nothing-here');
    expect(response?.status(), locale).toBe(404);
    await expect(fresh.getByRole('heading', { level: 1 }), locale).toHaveText(text);
    await expect(fresh.locator('#main'), locale).not.toContainText('could not be found');

    // 막다른 길로 두지 않는다
    await expect(fresh.locator('a[href="/"]').first()).toBeVisible();

    await context.close();
  }
});

test('없는 주소는 검색 결과에 남기지 않는다', async ({ page }) => {
  // 지운 상품이나 끝난 기획전의 주소가 색인되면 그 링크로 계속 여기에 닿는다.
  // 표시는 Next 가 붙여 준다 — 우리가 하나 더 얹으면 태그가 둘이 된다.
  await page.goto('/nothing-here');
  const robots = page.locator('meta[name="robots"]');
  await expect(robots).toHaveCount(1);
  await expect(robots).toHaveAttribute('content', /noindex/);
});
