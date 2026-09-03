import { test, expect } from '@playwright/test';

/** 운영자가 보는 화면 */

test('대시보드가 열린다', async ({ page }) => {
  await page.goto('/admin');

  await expect(page.getByRole('heading', { name: '대시보드', level: 1 })).toBeVisible();
});

test('기간을 바꾸면 라벨도 따라간다', async ({ page }) => {
  await page.goto('/admin?range=90d');

  // 데이터는 기간을 따라가는데 설명만 "최근 7일" 로 고정돼 있던 적이 있다.
  // 90일치 숫자를 7일치라고 읽게 된다.
  await expect(page.locator('#main')).toContainText('최근 90일');
  await expect(page.locator('#main')).not.toContainText('최근 7일');
});

test('모르는 기간은 기본값으로 되돌린다', async ({ page }) => {
  // 주소에 아무 값이나 들어올 수 있다. 오류를 내면 링크를 잘못 눌렀을 뿐인
  // 사람에게 빈 화면을 보여 주게 된다.
  await page.goto('/admin?range=%271%20OR%201%3D1');

  await expect(page.getByRole('heading', { name: '대시보드', level: 1 })).toBeVisible();
  await expect(page.locator('#main')).toContainText('최근 7일');
});

test('트래픽 화면이 세션 기준이 아니라고 밝힌다', async ({ page }) => {
  await page.goto('/admin/traffic');

  // 하루 단위로 접은 세션 수는 달 단위로 더할 수 없다. 그 사실을 화면이
  // 말하지 않으면 보는 사람이 세션 기준으로 읽는다.
  await expect(page.locator('#main')).toContainText('이벤트 수 기준');
});

test('쿠폰 발행 폼이 열린다', async ({ page }) => {
  await page.goto('/admin/coupons');

  const create = page.getByRole('button', { name: '새 쿠폰 만들기' });
  if ((await create.count()) > 0) await create.click();

  await expect(page.getByLabel('코드')).toBeVisible();
  // 대상을 고르지 않으면 전체라는 사실이 화면에 있어야 한다
  await expect(page.locator('#main')).toContainText('모든 상품');
});
