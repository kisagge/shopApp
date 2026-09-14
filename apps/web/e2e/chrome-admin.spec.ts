import { test, expect } from '@playwright/test';
import { ready } from './state';

/**
 * 운영 화면에 가게가 붙어 있지 않다.
 *
 * **한동안 붙어 있었다.** 루트 레이아웃이 매장의 머리와 발을 그렸고, 운영
 * 화면도 그 아래에 있으니 주문 표 밑에 카테고리 목록·고객센터·입점 신청
 * 링크가 그대로 달렸다. 눈으로는 "스크롤 끝의 남는 것" 이지만, 화면을 못 보는
 * 사람에게는 표를 다 지나온 끝에 **가게 메뉴가 한 벌 더 읽히는 것**이다.
 *
 * 매장 화면은 `(shop)` 그룹의 레이아웃이 두르고, 운영 화면은 자기 것을
 * 두른다. 주소는 하나도 안 바뀐다 — 그룹 폴더는 주소에 안 들어간다.
 */

const PAGES = ['/admin', '/admin/orders', '/admin/products', '/admin/support'] as const;

for (const path of PAGES) {
  test(`${path} 에 가게의 머리와 발이 없다`, async ({ page }) => {
    await page.goto(path);
    await ready(page);

    await expect(page.getByRole('banner'), '매장 헤더가 붙어 있다').toHaveCount(0);
    await expect(page.getByRole('contentinfo'), '매장 푸터가 붙어 있다').toHaveCount(0);
    await expect(
      page.getByRole('navigation', { name: '주요 카테고리' }),
      '운영 화면에 가게 카테고리가 있다',
    ).toHaveCount(0);
  });
}

test('그래도 본문으로 건너뛸 수 있다', async ({ page }) => {
  /*
   * **머리를 떼면서 `main` 도 함께 나갈 뻔했다.** 그것을 그리던 것이 루트
   * 레이아웃이었기 때문이다. 없으면 '본문 바로가기' 가 주소만 바꾸고 초점은
   * 사라지고, 낭독기는 이 화면에 본문이 없다고 말한다 — 표가 가장 빽빽한
   * 화면들이 여기다.
   */
  await page.goto('/admin/orders');
  await ready(page);

  await expect(page.getByRole('main')).toHaveCount(1);

  /*
   * 링크가 `sr-only` 라 눌러서 밟지 않는다 — 쓰는 사람도 그렇게 안 쓴다.
   * 첫 Tab 에 나타나고 Enter 로 간다. 그 길 그대로 밟는다.
   */
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: '본문 바로가기' })).toBeFocused();

  await page.keyboard.press('Enter');
  expect(
    await page.evaluate(() => document.activeElement?.id),
    '건너뛰기 링크가 초점을 본문에 못 옮겼다',
  ).toBe('main');
});

test('운영 메뉴는 그대로 있다', async ({ page }) => {
  // 떼는 김에 같이 떼어 버리지 않았는지 — 이것까지 없으면 화면을 못 옮긴다
  await page.goto('/admin');
  await ready(page);

  await expect(page.getByRole('navigation', { name: '관리자 메뉴' })).toBeVisible();
});

test('매장 화면에는 그대로 붙어 있다', async ({ page }) => {
  /*
   * 운영 화면에서 떼려다 **전부 떼어 버리는** 것이 가장 쉬운 실패다.
   * 운영 계정으로 매장에 가도 가게는 가게여야 한다.
   */
  await page.goto('/');
  await ready(page);

  await expect(page.getByRole('banner')).toBeVisible();
  await expect(page.getByRole('contentinfo')).toBeVisible();
  await expect(page.getByRole('main')).toHaveCount(1);
});

test('운영 화면에서 매장으로 건너갈 수 있다', async ({ page }) => {
  /*
   * **머리를 떼면서 매장으로 가는 길도 같이 떼었다.** 매장 로고가 그 길이었다.
   * 올린 상품이 매장에 어떻게 보이는지 보려면 주소창에 직접 적어야 했다.
   */
  await page.goto('/admin/orders');
  await ready(page);

  const link = page.getByRole('link', { name: '매장 보기' });
  await expect(link).toBeVisible();
  await link.click();

  await page.waitForURL((url) => url.pathname === '/');
  await expect(page.getByRole('banner'), '매장에 도착하지 못했다').toBeVisible();
});

test('본문이 길어도 사이드바가 화면 높이를 채운다', async ({ page }) => {
  /*
   * 사이드바가 메뉴 높이만큼만 어두워서, 본문이 긴 화면에서는 **메뉴 아래가
   * 비어** 본문 바탕이 드러났다. 스크롤해도 메뉴는 제자리에 있어야 한다.
   */
  await page.goto('/admin/support');
  await ready(page);

  const panel = page.locator('#admin-nav-panel');
  const viewport = page.viewportSize()!;
  const bodyHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  expect(bodyHeight, '본문이 짧아 이 검사가 아무것도 증명하지 않는다').toBeGreaterThan(viewport.height);

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const box = await panel.boundingBox();
  expect(box, '사이드바가 없다').not.toBeNull();
  /*
   * 위치를 양쪽으로 본다. 예전 사이드바는 바깥 틀이 본문만큼 늘어나 있었고
   * 어두운 면만 메뉴 높이에서 멈춰 있어서, 높이만 재면 틀을 잰 셈이 된다.
   */
  expect(Math.abs(box!.y), '스크롤하자 사이드바가 위로 밀려났다').toBeLessThanOrEqual(0.5);
  expect(box!.height, '사이드바가 화면 아래까지 닿지 않는다').toBeGreaterThanOrEqual(viewport.height - 1);
});
