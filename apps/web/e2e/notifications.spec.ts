import { test, expect } from '@playwright/test';
import { ready } from './state';

/**
 * 알림센터.
 *
 * 이 검사들은 실제로 알림을 만들지 않는다 — 만들려면 운영진이 주문을
 * 옮기거나 문의에 답해야 하고, 그건 다른 검사의 몫이다. 여기서는 **알림이
 * 있든 없든 화면이 말이 되는지**와 길이 이어져 있는지를 본다.
 *
 * 있든 없든, 이라고 적은 이유가 있다. 예전에는 "없을 때" 만 봤는데 그건
 * 이 계정에 알림이 안 쌓인다는 전제였고, 그 전제가 깨지자 조용히 졌다.
 */

test('머리의 알림 종이 목록으로 이어진다', async ({ page }) => {
  await page.goto('/');
  await ready(page);

  await page.getByRole('link', { name: /^알림/ }).click();

  await expect(page).toHaveURL('/mypage/notifications');
  await expect(page.getByRole('heading', { level: 1, name: '알림' })).toBeVisible();
});

/**
 * **비어 있다고 단정하지 않는다.**
 *
 * 처음에는 안내 문구가 보이는지만 봤다. 그건 이 계정에 알림이 하나도 없다는
 * 전제인데, 알림은 주문이 출고되거나 문의에 답이 달리거나 쿠폰이 발급되면
 * 생긴다 — 다른 검사가 만들 수도 있고, 개발하며 로컬에 쌓일 수도 있다.
 * 실제로 로컬 DB 에 쿠폰 알림이 하나 남아 이 검사가 며칠 동안 지고 있었다.
 * 바로 아래 탈퇴 검사가 같은 이유로 "주문 상태에 기대지 않는다" 고 적어 둔
 * 것과 같은 함정이다.
 *
 * 그래서 **상태가 어느 쪽이든 화면이 말이 되는지**를 본다. 비었으면 왜 비었는지
 * 말해야 하고, 있으면 목록이 있어야 한다. 둘 다 없으면 여기서 볼 것이 없고,
 * 둘 다 있으면 비었다고 해 놓고 목록을 그린 것이다.
 */
test('알림이 없으면 이유를 말하고, 있으면 목록을 보여 준다', async ({ page }) => {
  await page.goto('/mypage/notifications');
  await expect(page.getByRole('heading', { level: 1, name: '알림' })).toBeVisible();

  // "없습니다" 만 있으면 고장인지 원래 그런 건지 알 수 없다 — 이유가 함께 있어야 한다
  const emptyHint = page.getByText('주문이 출고되거나 문의에 답이 달리면 여기에 뜹니다.');
  /*
   * 이름으로 집는다. `getByRole('listitem')` 만 쓰면 머리의 메뉴와 빵부스러기
   * 까지 잡혀, 알림이 없는데도 "목록이 있다" 로 읽힌다 — 처음에 그렇게 졌다.
   */
  const list = page.getByRole('list', { name: '알림' }).getByRole('listitem');

  const empty = await emptyHint.count();
  const rows = await list.count();

  expect(empty + Math.min(rows, 1), '빈 안내와 목록 중 정확히 하나여야 한다').toBe(1);

  if (empty) {
    await expect(page.getByText('알림이 없습니다')).toBeVisible();
    await expect(emptyHint).toBeVisible();
  } else {
    // 목록이 있으면 각 줄이 언제 온 것인지 말해야 한다
    await expect(list.first()).toBeVisible();
    await expect(list.first().locator('time')).toHaveAttribute('datetime', /\d{4}-\d{2}-\d{2}/);
  }
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
