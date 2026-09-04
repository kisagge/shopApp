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

test('가맹점은 상품을 스스로 매대에 올릴 수 없다', async ({ page }) => {
  /*
   * product:publish 를 만들어 두고 어디서도 검사하지 않았다. 게다가 가맹점도
   * 그 권한을 갖고 있어서, 검사를 넣어도 아무것도 달라지지 않았다.
   */
  await page.goto('/admin/products/new');

  const status = page.getByLabel('판매 상태');
  await expect(status.getByRole('option', { name: '판매중' })).toHaveCount(0);
  await expect(status.getByRole('option', { name: '품절' })).toHaveCount(0);

  // 대신 요청할 길은 있어야 한다. 없으면 작성만 하고 끝난다.
  await expect(status.getByRole('option', { name: '검수 대기' })).toHaveCount(1);
  await expect(page.getByText(/운영진이 확인한 뒤에 됩니다/)).toBeVisible();
});

test('이미 가맹점이면 신청 화면이 아니라 어드민으로 간다', async ({ page }) => {
  // 여기서 할 수 있는 일이 없는데 화면만 띄우면 막다른 길이 된다
  await page.goto('/merchant/apply');
  expect(new URL(page.url()).pathname).toBe('/admin');
});

test('가맹점은 문의 대기줄을 본다', async ({ page }) => {
  // 자기 상품 문의는 파는 사람이 답하는 것이 맞다
  await page.goto('/admin');
  await expect(page.getByRole('link', { name: '문의' })).toBeVisible();

  await page.goto('/admin/inquiries');
  await expect(page.getByRole('heading', { name: '상품 문의', level: 1 })).toBeVisible();
  // 남의 상품 문의가 섞이면 할 일 목록이 되지 않는다
  await expect(page.getByText('내 브랜드만')).toBeVisible();
});
