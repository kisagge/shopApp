import { test, expect } from '@playwright/test';
import { STATE_FILE, ready } from './state';

/**
 * 좁은 화면에서 운영 메뉴를 불러낸다.
 *
 * **메뉴를 접었으면 불러낼 수 있어야 한다.** 사이드바가 232px 을 늘 차지해서
 * 375px 화면의 본문이 143px 밖에 안 되던 것을 접어 넣었는데, 접기만 하고
 * 불러내는 길이 망가지면 폰에서 운영 화면을 **아예 못 쓰게 된다.** 자리가
 * 무너지는 것보다 나쁘다.
 *
 * 자리가 무너지지 않는지는 layout-admin 이 375px 까지 잰다. 여기서 보는 것은
 * **여닫는 동작**이다 — 접힌 메뉴는 그 화면에 없으므로 layout 검사가 못 본다.
 */

test.use({ storageState: STATE_FILE.admin });
test.describe.configure({ mode: 'serial' });

const PHONE = { width: 375, height: 812 };

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto('/admin/orders');
  await ready(page);
});

test('접힌 메뉴의 링크는 탭 이동과 낭독기에서 빠진다', async ({ page }) => {
  /*
   * 투명도로만 숨기면 안 보이는 링크에 포커스가 들어간다 — 키보드로 훑는
   * 사람은 화면에 없는 것을 열다섯 번 지나가야 한다.
   */
  const panel = page.locator('#admin-nav-panel');
  await expect(panel).toBeHidden();
  await expect(page.getByRole('link', { name: '정산' })).toHaveCount(0);
});

test('열면 메뉴가 나오고, 첫 항목부터 보인다', async ({ page }) => {
  const open = page.getByRole('button', { name: '관리자 메뉴 열기' });
  await expect(open).toHaveAttribute('aria-expanded', 'false');
  await open.click();

  await expect(open).toHaveAttribute('aria-expanded', 'true');

  /*
   * **첫 항목이 띠에 가리지 않는지 본다.** 처음에는 머리띠의 단추가 X 로
   * 바뀌게 두었는데, 운영 화면이 손님 헤더 아래에 들어가 있어서 서랍이 띠까지
   * 덮었고 대시보드가 그 뒤에 숨었다. 그래서 서랍이 자기 닫기 단추를 갖는다.
   */
  const first = page.locator('#admin-nav-panel').getByRole('link', { name: '대시보드' });
  await expect(first).toBeInViewport();
});

test('메뉴로 화면을 옮기면 스스로 닫힌다', async ({ page }) => {
  await page.getByRole('button', { name: '관리자 메뉴 열기' }).click();
  await page.locator('#admin-nav-panel').getByRole('link', { name: '정산' }).click();

  await page.waitForURL(/\/admin\/settlements/);
  await ready(page);
  // 열어 둔 메뉴가 새 화면을 덮고 있으면 옮긴 뜻이 없다
  await expect(page.locator('#admin-nav-panel')).toBeHidden();
});

test('Esc 로 닫고, 포커스는 열었던 단추로 돌아온다', async ({ page }) => {
  const open = page.getByRole('button', { name: '관리자 메뉴 열기' });
  await open.click();
  await expect(page.locator('#admin-nav-panel')).toBeVisible();

  await page.keyboard.press('Escape');

  await expect(page.locator('#admin-nav-panel')).toBeHidden();
  // 닫고 포커스를 잃으면 키보드 사용자는 처음부터 다시 찾아야 한다
  await expect(open).toBeFocused();
});

test('닫기 단추로도 닫힌다 — 화면만 보는 사람에게 남는 유일한 길이다', async ({ page }) => {
  await page.getByRole('button', { name: '관리자 메뉴 열기' }).click();
  await page.getByRole('button', { name: '관리자 메뉴 닫기' }).click();
  await expect(page.locator('#admin-nav-panel')).toBeHidden();
});

test('넓은 화면에서는 접히지 않고 늘 서 있다', async ({ page }) => {
  /*
   * 접는 쪽만 검사하면, 어느 날 데스크톱에서도 접히게 되어도 통과한다.
   * 표가 빽빽한 화면에서 메뉴가 늘 보이는 편이 낫다는 판단을 함께 못 박는다.
   */
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/admin/orders');
  await ready(page);

  await expect(page.locator('#admin-nav-panel')).toBeVisible();
  await expect(page.getByRole('button', { name: '관리자 메뉴 열기' })).toBeHidden();
});
