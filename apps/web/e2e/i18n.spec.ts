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
