import { test, expect } from '@playwright/test';

/**
 * 홈 화면에 추가했을 때 앱처럼 뜨는가.
 *
 * 서비스워커는 **실제 브라우저에서만 확인할 수 있다.** 목으로는 등록도
 * 캐시도 흉내만 낼 수 있어서, 오프라인에 정말 우리 화면이 뜨는지는
 * 알 수 없다. 그래서 여기서 본다.
 */

test('manifest 가 앱으로 뜰 조건을 갖춘다', async ({ page }) => {
  await page.goto('/');

  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();

  const response = await page.request.get(href!);
  expect(response.status()).toBe(200);

  const manifest = (await response.json()) as {
    name: string; start_url: string; display: string;
    icons: { src: string; sizes: string; purpose?: string }[];
  };

  expect(manifest.name).toBe('PLAIN');
  expect(manifest.start_url).toBe('/');
  // standalone 이 아니면 추가해 봐야 브라우저 탭 그대로 열린다
  expect(manifest.display).toBe('standalone');

  // 192·512 가 없으면 안드로이드가 설치 대상으로 보지 않는다
  const sizes = manifest.icons.map((icon) => icon.sizes);
  expect(sizes).toContain('192x192');
  expect(sizes).toContain('512x512');
  // 잘라 쓰는 아이콘이 없으면 시스템이 흰 배경에 축소해 넣는다
  expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
});

test('아이콘이 실제로 그려진다', async ({ page }) => {
  for (const src of ['/icon.svg', '/apple-icon', '/pwa-icon/192', '/pwa-icon/512']) {
    const response = await page.request.get(src);
    expect(response.status(), src).toBe(200);
    expect(Number(response.headers()['content-length'] ?? 1), src).toBeGreaterThan(0);
  }
});

test('모르는 크기는 만들어 주지 않는다', async ({ page }) => {
  // 주소에 아무 숫자나 넣어 이미지를 찍어 내게 하면 안 된다
  expect((await page.request.get('/pwa-icon/999')).status()).toBe(404);
});

test('연결이 끊기면 브라우저 오류 대신 우리 화면이 뜬다', async ({ page, context }) => {
  await page.goto('/');

  // 등록은 첫 화면과 경쟁하지 않게 한 박자 미룬다
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
    timeout: 15_000,
  });

  // 오프라인 화면이 실제로 담겼는지 본다 — 담기지 않으면 끊겼을 때 보여 줄 것이 없다
  const cached = await page.evaluate(async () => {
    const match = await caches.match('/offline');
    return match?.status ?? null;
  });
  expect(cached).toBe(200);

  await context.setOffline(true);
  try {
    await page.goto('/category/outer');
    await expect(page.getByRole('heading', { name: '연결할 수 없습니다' })).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});
