import { test, expect } from '@playwright/test';
import { ready } from './state';

/**
 * 알림센터.
 *
 * 이 검사들은 실제로 알림을 만들지 않는다 — 만들려면 운영진이 주문을
 * 옮기거나 문의에 답해야 하고, 그건 다른 검사의 몫이다. 여기서는 **알림이
 * 없을 때도 화면이 말이 되는지**와 길이 이어져 있는지를 본다.
 */

test('머리의 알림 종이 목록으로 이어진다', async ({ page }) => {
  await page.goto('/');
  await ready(page);

  await page.getByRole('link', { name: /^알림/ }).click();

  await expect(page).toHaveURL('/mypage/notifications');
  await expect(page.getByRole('heading', { level: 1, name: '알림' })).toBeVisible();
});

test('알림이 없으면 무엇이 뜨는지 알려 준다', async ({ page }) => {
  await page.goto('/mypage/notifications');

  // "없습니다" 만 있으면 고장인지 원래 그런 건지 알 수 없다
  await expect(page.getByText('주문이 출고되거나 문의에 답이 달리면 여기에 뜹니다.')).toBeVisible();
});

test('마이페이지 메뉴에도 자리가 있다', async ({ page }) => {
  await page.goto('/mypage');

  /*
   * "재입고 알림" 도 이름에 "알림" 이 들어간다. 경로로 집는다 — 이름으로
   * 집으면 메뉴가 하나 늘 때마다 흔들린다.
   */
  await page
    .getByRole('navigation', { name: '마이페이지 메뉴' })
    .locator('a[href="/mypage/notifications"]')
    .click();

  await expect(page).toHaveURL('/mypage/notifications');
});

test('로그인하지 않으면 로그인으로 보낸다', async ({ page, context }) => {
  await context.clearCookies();
  await page.goto('/mypage/notifications');

  await expect(page).toHaveURL(/\/login/);
});
