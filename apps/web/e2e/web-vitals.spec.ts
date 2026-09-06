import { test, expect } from '@playwright/test';

/**
 * 실사용자 성능 수집.
 *
 * **내 기계에서 잰 숫자는 아무것도 말해 주지 않는다.** 이 저장소에서 잰
 * "첫 바이트 14.9ms" 는 DB 가 같은 기계에 있고 캐시가 데워진 상태의 값이다.
 * 그래서 실제 방문에서 모으는데, **모으고 있는지 자체가 조용히 깨질 수 있다**
 * — 보고자가 안 붙어도 화면은 멀쩡하고 어드민 표만 계속 비어 있다.
 */

/** 그 화면이 보낸 성능 이벤트 */
async function vitalsFrom(page: import('@playwright/test').Page, path: string) {
  // 속성은 봉투 안에 평평하게 들어간다 — 서버가 아는 칸만 골라 담고 나머지를 props 로 접는다
  const sent: Record<string, unknown>[] = [];

  await page.route('**/api/events', async (route) => {
    const body = route.request().postDataJSON() as { events?: Record<string, unknown>[] };
    for (const e of body.events ?? []) {
      if (e['name'] === 'web_vitals') sent.push(e);
    }
    await route.continue();
  });

  await page.goto(path);
  // 화면을 떠날 때 확정된 값이 함께 나간다
  await page.evaluate(() => window.scrollBy(0, 600));
  await page.goto('/support');
  await expect.poll(() => sent.length, { timeout: 10_000 }).toBeGreaterThan(0);

  return sent;
}

test('실제 방문에서 성능 값을 보낸다', async ({ page }) => {
  const sent = await vitalsFrom(page, '/');

  const metrics = new Set(sent.map((s) => s['metric']));
  // TTFB 는 그리기와 무관하게 늘 나온다. 나머지는 브라우저가 확정할 때 온다.
  expect(metrics.has('TTFB'), `받은 것: ${[...metrics].join(', ')}`).toBe(true);

  for (const s of sent) {
    expect(typeof s['value']).toBe('number');
    expect(['good', 'needs-improvement', 'poor']).toContain(s['rating']);
  }
});

test('좋고 나쁨을 값과 함께 보낸다 — 나중에 기준이 바뀌어도 다시 셀 수 있게', async ({ page }) => {
  const sent = await vitalsFrom(page, '/product/oversized-wool-coat');
  const ttfb = sent.find((s) => s['metric'] === 'TTFB');

  expect(ttfb).toBeTruthy();
  // 값과 판정을 함께 남긴다. 값만 있으면 그때의 기준을 알 수 없다.
  expect(ttfb!['value']).toBeGreaterThanOrEqual(0);
  expect(ttfb!['rating']).toBeTruthy();
});
