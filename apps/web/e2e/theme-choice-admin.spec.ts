import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ready } from './state';

/**
 * 운영진도 화면 밝기를 고른다.
 *
 * **처음에는 매장 푸터에만 두었다.** 운영 화면도 루트 레이아웃 아래에 있어서
 * 그 푸터가 페이지 맨 아래에 붙기는 한다 — 매장으로 갈 필요까지는 없었다.
 * 다만 주문 표가 몇 백 줄인 화면에서 그것은 스크롤 끝의 다른 세상이고,
 * 사이드바는 늘 눈에 있다. 설정은 눈에 있는 쪽에 둔다.
 *
 * 운영 사이드바는 **테마와 무관하게 늘 어둡게** 설계돼 있다. 그래서 여기서
 * "밝게" 를 눌러도 사이드바는 안 바뀐다. 바뀌는 것은 본문이다.
 * 그 말을 화면에 적어 두지 않으면, 눌러도 안 먹는 것으로 읽힌다.
 */

/**
 * 본문이 실제로 어떤 색으로 칠해졌는지. 값이 아니라 **픽셀**을 읽는다.
 *
 * `main` 자체는 배경이 없다 — 색은 그 위 어느 조상이 칠한다. 자기 것만 읽으면
 * `rgba(0,0,0,0)` 이 나오고, 그것을 빈 캔버스에 칠하면 **무엇이든 새까맣게**
 * 나온다. 처음에 그렇게 재서 밝은 화면이 0 으로 읽혔다. 실제로 칠한 조상을
 * 찾아 올라간다.
 */
/**
 * 사이드바 안의 단추.
 *
 * **같은 이름의 단추가 한 화면에 둘이다** — 페이지 맨 아래 매장 푸터에도
 * 같은 폼이 있다. 좁히지 않으면 어느 쪽을 눌렀는지 모르는 검사가 된다.
 */
const inNav = (page: Page, name: string) =>
  page.locator('#admin-nav-panel').getByRole('button', { name });

async function bodyLightness(page: Page): Promise<number> {
  return await page.evaluate(() => {
    let node: HTMLElement | null = document.querySelector('main') ?? document.body;
    let painted = '';
    while (node) {
      const color = getComputedStyle(node).backgroundColor;
      if (color && !/^rgba\(0, 0, 0, 0\)$|^transparent$/.test(color)) { painted = color; break; }
      node = node.parentElement;
    }
    if (!painted) throw new Error('칠해진 바탕을 못 찾았다');

    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = painted;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return (r! + g! + b!) / 3;
  });
}

test.describe('기기가 밝을 때', () => {
  test.use({ colorScheme: 'light' });

  test('운영 화면을 떠나지 않고 어둡게 바꾼다', async ({ page }) => {
    await page.goto('/admin');
    await ready(page);
    expect(await bodyLightness(page), '기기가 밝은데 본문이 어둡다').toBeGreaterThan(200);

    await inNav(page, '어둡게').click();
    await page.waitForLoadState('domcontentloaded');

    // 보던 화면에 그대로 남는다 — 매장으로 튕기면 하던 일을 잃는다
    expect(new URL(page.url()).pathname).toBe('/admin');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await bodyLightness(page), '어둡게 골랐는데 본문이 안 어둡다').toBeLessThan(60);

    await inNav(page, '시스템 설정').click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/);
  });

  test('사이드바는 안 바뀐다고 화면에 적혀 있다', async ({ page }) => {
    /*
     * **적어 두지 않으면 고장으로 읽힌다.** 밝기를 고르는 단추 바로 위가
     * 늘 어두운 채로 남으니, 눌러도 아무 일이 없는 것처럼 보인다.
     */
    await page.goto('/admin');
    await ready(page);

    await expect(
      page.locator('#admin-nav-panel').getByText('화면 밝기 — 본문에 적용됩니다'),
    ).toBeVisible();
  });

  test('좁은 화면에서는 서랍 안에 있다', async ({ page }) => {
    /*
     * 폰에서 사이드바는 접혀 있다. 밝기만 서랍 밖에 따로 세우면 좁은 화면이
     * 또 좁아진다 — 메뉴와 같은 자리에 둔다.
     */
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/admin');
    await ready(page);

    const dark = inNav(page, '어둡게');
    await expect(dark, '접기 전에 이미 나와 있다').toBeHidden();

    // 매장 헤더의 "메뉴" 단추도 같은 화면에 있다 — 운영 것을 이름으로 집는다
    await page.getByRole('button', { name: '관리자 메뉴 열기' }).click();
    await expect(dark).toBeVisible();

    await dark.click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
});

test.describe('기기가 어두울 때', () => {
  test.use({ colorScheme: 'dark' });

  test('운영진도 밝게 고를 수 있다', async ({ page }) => {
    await page.goto('/admin');
    await ready(page);
    expect(await bodyLightness(page), '기기가 어두운데 본문이 밝다').toBeLessThan(60);

    await inNav(page, '밝게').click();
    await page.waitForLoadState('domcontentloaded');

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(await bodyLightness(page), '밝게 골랐는데 본문이 안 밝다').toBeGreaterThan(200);
  });
});
