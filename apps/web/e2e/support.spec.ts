import { test, expect } from '@playwright/test';
import { ready } from './state';

/**
 * 고객센터.
 *
 * 시드가 넣어 둔 공지와 FAQ 가 있다는 전제다 — 내용을 박지 않고 "있다" 만
 * 확인한다. 시드 문구를 다듬을 때마다 테스트가 깨지면 안 된다.
 */

test('푸터에서 고객센터로 갈 수 있다', async ({ page }) => {
  await page.goto('/');
  await ready(page);

  await page.getByRole('contentinfo').getByRole('link', { name: '고객센터' }).click();

  await expect(page).toHaveURL('/support');
  await expect(page.getByRole('heading', { level: 1, name: '고객센터' })).toBeVisible();
});

test('FAQ 는 스크립트 없이도 펼쳐진다', async ({ page }) => {
  await page.goto('/support');

  // details/summary 라 브라우저가 여닫는다
  const first = page.locator('details').first();
  await expect(first).not.toHaveAttribute('open', '');

  await first.getByRole('group').or(first.locator('summary')).first().click();

  await expect(first).toHaveAttribute('open', '');
});

test('공지는 목록에서 열어 볼 수 있다', async ({ page }) => {
  await page.goto('/support/notice');

  const first = page.locator('main a[href^="/support/notice/"]').first();
  /*
   * 한 줄에는 제목과 날짜가 함께 있다. 링크 전체를 읽으면 날짜까지 딸려
   * 오므로 제목 칸만 읽는다. 고정 표시(●)는 장식이라 떼어 낸다.
   */
  const title = (await first.locator('span').first().innerText()).replace(/^●\s*/, '').trim();
  expect(title).not.toBe('');

  await first.click();

  await expect(page).toHaveURL(/\/support\/notice\/.+/);
  // 목록에서 본 제목이 상세의 h1 이다
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
});

test('로그인하지 않으면 문의 폼 대신 로그인을 권한다', async ({ page }) => {
  await page.goto('/support/ask');

  await expect(page.getByText('문의하려면 로그인이 필요합니다')).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
});
