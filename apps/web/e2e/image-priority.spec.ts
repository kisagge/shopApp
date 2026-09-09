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

/*
 * **2배 화면에서 본다.**
 *
 * 기본 뷰포트(1280 · 1배)에서는 과하게 적힌 sizes 도 드러나지 않는다 —
 * 282px 자리에 25vw(320px)를 말해도 후보가 384px 로 같아진다. 실제로
 * 옛 값으로 되돌려 놓고 돌려 보니 그대로 통과했다.
 *
 * 요즘 화면은 대부분 2배이고, 거기서는 같은 오차가 후보를 한 단계 끌어
 * 올린다 — 640px 이면 될 자리에 828px 을 받는다.
 */
test.describe('2배 화면', () => {
  test.use({ viewport: { width: 1512, height: 900 }, deviceScaleFactor: 2 });

  test('받아 오는 사진이 자리보다 크지 않다', async ({ page }) => {
    /*
     * **글자가 아니라 받아 온 것을 본다.** 앞의 명세는 `sizes` 에 100vw 가
     * 있는지만 봤는데, 그것만으로는 "본문이 1280px 에서 멈춘다" 를 빠뜨린
     * 값을 못 잡는다 — `50vw` 는 넓은 화면에서 592px 자리를 756px 이라고
     * 말했고, 브라우저는 그 말을 믿고 1920px 짜리를 받아 왔다(1.6배).
     *
     * 그래서 **자리 크기와 실제로 받은 후보를 견준다.** 자리를 덮는 가장 작은
     * 후보보다 큰 것을 받았다면 sizes 가 과하게 적힌 것이다.
     *
     * 반대 방향은 재지 않는다. 모자라게 적으면 흐릿해지는데, 그건 눈으로
     * 보이는 종류라 이 검사가 아니어도 드러난다.
     */
    for (const path of ['/category/outer', '/collections']) {
      await page.goto(path);
      await expect(page.locator('#main img[sizes]').first()).toBeVisible();

      const over = await page.locator('#main img[sizes]').evaluateAll((els) =>
        els.flatMap((el) => {
          const img = el as HTMLImageElement;
          if (!img.currentSrc) return [];
          const width = Math.round(img.getBoundingClientRect().width);
          if (width === 0) return [];

          const got = Number(/[?&]w=(\d+)/.exec(img.currentSrc)?.[1] ?? 0);
          const candidates = [...(img.getAttribute('srcset') ?? img.srcset).matchAll(/[?&]w=(\d+)/g)]
            .map((m) => Number(m[1]))
            .sort((a, b) => a - b);

          const need = width * window.devicePixelRatio;
          const smallest = candidates.find((c) => c >= need);
          if (got === 0 || smallest === undefined || got <= smallest) return [];
          return [`${width}px 자리에 ${got}px 을 받았다 (${smallest}px 이면 된다)`];
        }),
      );

      expect(over, `${path} 의 sizes 가 자리보다 크게 적혀 있다`).toEqual([]);
    }
  });
});
