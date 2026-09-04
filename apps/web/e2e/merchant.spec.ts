import { test, expect } from '@playwright/test';

/** 가맹점은 자기 것만 본다 */

test('가맹점도 어드민에는 들어간다', async ({ page }) => {
  await page.goto('/admin');

  await expect(page.getByRole('heading', { name: '대시보드', level: 1 })).toBeVisible();
});

test('감사 로그는 메뉴에도 없고 주소로도 못 간다', async ({ page }) => {
  await page.goto('/admin');

  // 감사 로그는 운영진을 감시하는 도구다
  await expect(page.getByRole('link', { name: '감사 로그' })).toHaveCount(0);

  // 메뉴를 감추는 것만으로는 부족하다. 주소를 직접 쳐도 막혀야 한다.
  await page.goto('/admin/audit');
  expect(new URL(page.url()).pathname).not.toBe('/admin/audit');
});

test('쿠폰은 플랫폼 비용이라 가맹점이 만들지 않는다', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.getByRole('link', { name: '쿠폰' })).toHaveCount(0);

  await page.goto('/admin/coupons');
  expect(new URL(page.url()).pathname).not.toBe('/admin/coupons');
});

test('리뷰 관리는 가맹점에게 없다', async ({ page }) => {
  await page.goto('/admin');

  // 자기 상품의 혹평을 내릴 수 있으면 리뷰가 상품 설명의 일부가 된다
  await expect(page.getByRole('link', { name: '리뷰' })).toHaveCount(0);

  // 메뉴를 감추는 것만으로는 부족하다
  await page.goto('/admin/reviews');
  expect(new URL(page.url()).pathname).not.toBe('/admin/reviews');
});
