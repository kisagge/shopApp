import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ready } from './state';

/**
 * 사람이 화면 밝기를 고른다.
 *
 * **한동안 고를 수 없었다.** 어두운 테마는 기기 설정(`prefers-color-scheme`)
 * 만 따라갔다. CSS 에는 `:root[data-theme="dark"]` 규칙이 이미 있었는데 그
 * 값을 세우는 코드가 어디에도 없어서, 쓰이지 않는 규칙이 한 벌 누워 있었다.
 *
 * 여기서 보는 것은 셋이다.
 *
 * 1. **고른 것이 이긴다** — 기기가 밝아도 어둡게 고르면 어둡다. 그 반대도.
 * 2. **첫 그림부터 그 밝기다** — 서버가 `<html data-theme>` 를 박는다.
 *    브라우저에서 칠하면 어두운 방에서 흰 화면이 한 번씩 번쩍인다.
 * 3. **스크립트 없이도 바뀐다** — 평범한 폼 전송이라서.
 */

/** 지금 화면이 실제로 어떤 색인지. 값이 아니라 **칠해진 픽셀**을 읽는다. */
async function ground(page: Page): Promise<{ theme: string | null; scheme: string; rgb: string }> {
  return await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = getComputedStyle(document.body).backgroundColor;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return {
      theme: document.documentElement.getAttribute('data-theme'),
      scheme: getComputedStyle(document.documentElement).colorScheme,
      rgb: `${r},${g},${b}`,
    };
  });
}

/** 밝기는 밝음의 대략값이면 충분하다 — 정확한 색은 대비 검사들이 본다 */
const lightness = (rgb: string): number =>
  rgb.split(',').reduce((sum, n) => sum + Number(n), 0) / 3;

async function choose(page: Page, label: string): Promise<void> {
  await page.getByRole('button', { name: label }).click();
  await page.waitForLoadState('domcontentloaded');
}

test.describe('기기가 밝을 때', () => {
  test.use({ colorScheme: 'light' });

  test('어둡게 고르면 어두워지고, 시스템으로 되돌릴 수 있다', async ({ page }) => {
    await page.goto('/');
    await ready(page);

    const before = await ground(page);
    expect(before.theme, '고른 적 없으면 표시를 안 붙인다').toBeNull();
    expect(lightness(before.rgb), '기기가 밝은데 어둡다').toBeGreaterThan(200);

    await choose(page, '어둡게');
    const dark = await ground(page);
    expect(dark.theme).toBe('dark');
    expect(lightness(dark.rgb), '어둡게 골랐는데 안 어둡다').toBeLessThan(60);

    /*
     * **되돌리는 길이 있어야 한다.** 한 번 고르면 다시는 기기 설정을
     * 따라갈 수 없는 것은 기능이 아니라 함정이다.
     */
    await choose(page, '시스템 설정');
    const back = await ground(page);
    expect(back.theme, '시스템으로 되돌렸는데 표시가 남아 있다').toBeNull();
    expect(lightness(back.rgb)).toBeGreaterThan(200);
  });

  test('고른 밝기가 다른 화면으로 따라간다', async ({ page }) => {
    await page.goto('/');
    await ready(page);
    await choose(page, '어둡게');

    // 쿠키 한 장이라 화면을 옮겨도, 새로 열어도 그대로여야 한다
    await page.goto('/support');
    await ready(page);
    expect((await ground(page)).theme).toBe('dark');
  });
});

test.describe('기기가 어두울 때', () => {
  test.use({ colorScheme: 'dark' });

  test('밝게 고르면 기기 설정을 이긴다', async ({ page }) => {
    /*
     * **반대 방향도 된다는 것이 요점이다.** `prefers-color-scheme` 만 보고
     * 만들면 어두운 기기에서 밝게 쓰는 길이 아예 없다.
     */
    await page.goto('/');
    await ready(page);
    expect(lightness((await ground(page)).rgb), '기기가 어두운데 밝다').toBeLessThan(60);

    await choose(page, '밝게');
    const light = await ground(page);
    expect(light.theme).toBe('light');
    expect(lightness(light.rgb), '밝게 골랐는데 안 밝다').toBeGreaterThan(200);
  });

  test('브라우저가 그리는 것까지 따라온다', async ({ page }) => {
    /*
     * 스크롤바·기본 폼 위젯·자동완성 배경은 우리가 칠하는 것이 아니라
     * 브라우저가 칠한다. `color-scheme` 을 안 주면 어두운 화면에 **흰
     * 스크롤바**가 붙는다 — 한동안 그랬다.
     */
    await page.goto('/');
    await ready(page);
    expect((await ground(page)).scheme, '기기가 어두운데 밝게 그린다').toBe('dark');

    await choose(page, '밝게');
    expect((await ground(page)).scheme, '밝게 골랐는데 어둡게 그린다').toBe('light');
  });
});

test('스크립트가 없어도 밝기를 바꿀 수 있다', async ({ browser }) => {
  /*
   * **여기가 이 파일의 요점이다.** 클릭 핸들러로 만들었다면 이 검사는
   * 실패한다. 평범한 폼 전송이라 서버가 쿠키를 심고 되돌려 보내고, 다음
   * HTML 이 이미 그 밝기로 나온다.
   *
   * 밝기는 **눈이 불편해서 바꾸는 사람**이 있는 설정이다. 하필 그 설정이
   * 스크립트에 기대고 있으면 안 된다.
   */
  const ctx = await browser.newContext({ javaScriptEnabled: false, colorScheme: 'light' });
  try {
    const page = await ctx.newPage();
    await page.goto('/');

    await page.getByRole('button', { name: '어둡게' }).click();
    await page.waitForLoadState('domcontentloaded');

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  } finally {
    await ctx.close();
  }
});
