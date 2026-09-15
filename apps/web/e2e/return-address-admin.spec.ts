import { test, expect, type Page } from '@playwright/test';
import { ready } from './state';

/**
 * 반품지를 운영 화면에서 등록·수정한다.
 *
 * **반품을 승인하면 손님은 이 주소로 물건을 보낸다.** 그래서 두 가지를 본다 — 고친 값이 실제로 저장되는지, 그리고
 * 가맹점 반품지와 자사 상품 반품지가 **서로 다른 자리**에 있는지. 가맹점 것은 가맹점 화면에서, 자사 것은 배송비 화면에서
 * 고친다(가게 전체의 약속이라 배송 정책과 같은 자리다).
 *
 * 값을 바꾸고 나면 원래대로 돌려놓는다 — 다른 명세가 시드 주소를 본다.
 */

test.describe.configure({ mode: 'serial' });

const MOOR_DETAIL = { seeded: '', changed: '3동 하역장' } as const;
const PLATFORM_DETAIL = { seeded: 'PLAIN 물류센터 2층', changed: 'PLAIN 물류센터 3층' } as const;

async function saveDetail(page: Page, detail: string): Promise<void> {
  const field = page.getByLabel('상세주소');
  await field.fill(detail);
  await page.getByRole('button', { name: /반품지 (수정|등록)/ }).click();
  await expect(page.getByRole('status')).toHaveText(/반품지를 저장했습니다/, { timeout: 20_000 });
}

test('가맹점 반품지를 목록에서 찾아 고친다', async ({ page }) => {
  await page.goto('/admin/merchants');
  await ready(page);

  // 표에서 반품지 칸을 보고 들어간다 — 미등록이면 승인을 못 하므로 목록에서 먼저 보여야 한다
  const row = page.getByRole('row').filter({ hasText: '무어' });
  await row.getByRole('link', { name: /반품지/ }).click();
  await page.waitForURL(/\/admin\/merchants\/[^/]+\/return-address$/);
  await ready(page);

  await expect(page.getByRole('heading', { name: '무어 반품지', level: 1 })).toBeVisible();
  await expect(page.getByLabel('받는 분')).toHaveValue('무어 반품담당');

  await saveDetail(page, MOOR_DETAIL.changed);

  // 다시 열어도 그대로여야 한다 — 화면만 바뀌고 저장이 안 된 적이 있다
  await page.reload();
  await ready(page);
  await expect(page.getByLabel('상세주소')).toHaveValue(MOOR_DETAIL.changed);

  await saveDetail(page, MOOR_DETAIL.seeded);
});

test('말이 안 되는 연락처는 저장하지 않고 그 칸을 짚는다', async ({ page }) => {
  await page.goto('/admin/merchants');
  await ready(page);
  await page.getByRole('row').filter({ hasText: '무어' }).getByRole('link', { name: /반품지/ }).click();
  await ready(page);

  await page.getByLabel('반품 담당자 휴대폰').fill('1234');
  await page.getByRole('button', { name: /반품지 (수정|등록)/ }).click();

  await expect(page.getByLabel('반품 담당자 휴대폰')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('status')).toHaveText('');
});

test('자사 상품 반품지는 배송비 화면에 있다 — 한 가맹점의 일이 아니다', async ({ page }) => {
  await page.goto('/admin/shipping');
  await ready(page);

  const section = page.getByRole('region', { name: '자사 상품 반품지' });
  await expect(section).toBeVisible();
  await expect(section.getByLabel('받는 분')).toHaveValue('PLAIN 반품센터');

  await section.getByLabel('상세주소').fill(PLATFORM_DETAIL.changed);
  await section.getByRole('button', { name: /반품지 (수정|등록)/ }).click();
  await expect(section.getByRole('status')).toHaveText(/반품지를 저장했습니다/, { timeout: 20_000 });

  await page.reload();
  await ready(page);
  const again = page.getByRole('region', { name: '자사 상품 반품지' });
  await expect(again.getByLabel('상세주소')).toHaveValue(PLATFORM_DETAIL.changed);

  await again.getByLabel('상세주소').fill(PLATFORM_DETAIL.seeded);
  await again.getByRole('button', { name: /반품지 (수정|등록)/ }).click();
  await expect(again.getByRole('status')).toHaveText(/반품지를 저장했습니다/, { timeout: 20_000 });
});
