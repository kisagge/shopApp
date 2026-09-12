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
