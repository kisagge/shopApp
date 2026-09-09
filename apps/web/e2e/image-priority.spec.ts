import { test, expect } from '@playwright/test';

/**
 * 미리 받는 이미지.
 *
 * `priority` 를 준 이미지는 브라우저가 `<link rel="preload">` 로 먼저 받는다.
 * **그건 화면의 가장 큰 그림 하나를 위한 것이지 목록이 아니다** — 홈에서
 * 일곱 장을 미리 받고 있었다. 배너 하나, 기획전 카드 둘, 상품 넉 장. 뒤의
 * 여섯은 화면 밖인데 배너와 대역폭을 나눠 썼다.
 *
 * 눈으로는 아무 차이도 안 보이는 종류라 검사로 박아 둔다.
 *
 * **세는 것이 아니라 상한을 본다.** 사진 시드는 저장소가 있어야 하는 별도
 * 명령이라 갓 시드한 DB 에는 사진이 하나도 없다 — 거기서는 전부 0 이다.
 * "몇 장이어야 한다" 로 쓰면 그쪽에서 헛돌고, "이보다 많으면 안 된다" 는
 * 양쪽에서 같은 뜻을 갖는다. 되돌리면 일곱이 되므로 상한으로도 잡힌다.
 */

/** 그 화면이 미리 받는 이미지 수 */
async function preloadCount(page: import('@playwright/test').Page, path: string) {
  await page.goto(path);
  return page.locator('link[rel="preload"][as="image"]').count();
}

test('큰 머리 그림이 있는 화면은 그 하나까지만 미리 받는다', async ({ page }) => {
  // 홈은 배너가, 기획전 상세는 머리 그림이 가장 큰 그림이다
  expect(await preloadCount(page, '/'), '홈').toBeLessThanOrEqual(1);
  expect(await preloadCount(page, '/collection/winter-outer'), '기획전 상세').toBeLessThanOrEqual(1);
});

test('격자가 맨 위인 화면도 첫 줄까지만 미리 받는다', async ({ page }) => {
  // 여기서는 격자가 곧 첫 화면이라 미리 받는 것이 맞다 — 다만 첫 줄까지다
  expect(await preloadCount(page, '/category/outer')).toBeLessThanOrEqual(4);
});

test('목록만 있는 화면은 미리 받지 않는다', async ({ page }) => {
  expect(await preloadCount(page, '/collections')).toBe(0);
});

test('표시 크기를 실제 자리에 맞춘다 — 어긋나면 최적화가 헛돈다', async ({ page }) => {
  /*
   * 기획전 카드는 두 칸 격자인데 `100vw` 로 두었더니 592px 자리에 3840px
   * 후보를 받아 왔다 — 1,200px 이면 될 것을 96KB 로 받는다(필요분 50KB).
   */
  await page.goto('/collections');
  const sizes = await page
    .locator('#main img[sizes]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('sizes')));

  /*
   * **건너뛰지 않는다.** 시드가 기획전에 사진을 안 걸어서 이 검사가 CI 에서
   * 한 번도 돌지 않았다. 이제 앱 안의 자리표시를 걸어 두므로, 사진이 없다는
   * 것은 시드가 되돌아갔다는 뜻이다.
   */
  expect(sizes.length, '시드가 기획전 사진을 걸어야 이 검사가 볼 것이 있다').toBeGreaterThan(0);
  expect(sizes, '두 칸 격자에 100vw 를 쓰면 안 된다').not.toContain('100vw');
});
