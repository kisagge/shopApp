import { test, expect } from '@playwright/test';

/**
 * 사이트맵이 화면과 어긋나지 않는지.
 *
 * **목록을 손으로 적지 않는다.** 사이트에서 실제로 걸려 있는 링크를 긁어
 * 대조한다 — 상품이나 갈래가 늘어도 검사가 따라온다.
 */

async function sitemapLocs(page: import('@playwright/test').Page): Promise<Set<string>> {
  const xml = await (await page.request.get('/sitemap.xml')).text();
  return new Set(
    [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!).pathname),
  );
}

test('화면에 걸린 갈래가 사이트맵에도 있다', async ({ page }) => {
  /*
   * 여기가 비어 있었다. 사이트맵이 헤더용 목록(최상위 갈래만)을 그대로
   * 써서 하위 갈래 여덟 개가 빠져 있었다 — `/category/outer-coat` 는
   * 멀쩡히 열리고 noindex 도 없는데 사이트맵에만 없었다. 긴 꼬리 검색이
   * 닿는 자리가 바로 그 화면들이다.
   */
  await page.goto('/');
  const tops = await page
    .locator('header a[href^="/category/"]')
    .evaluateAll((els) => [...new Set(els.map((e) => new URL((e as HTMLAnchorElement).href).pathname))]);
  expect(tops.length).toBeGreaterThan(0);

  // 각 갈래 화면 안의 하위 갈래 칸까지 모은다
  const all = new Set(tops);
  for (const top of tops) {
    await page.goto(top);
    for (const href of await page
      .locator('#main a[href^="/category/"]')
      .evaluateAll((els) => els.map((e) => new URL((e as HTMLAnchorElement).href).pathname))) {
      all.add(href);
    }
  }
  // 하위 갈래가 실제로 잡혀야 이 검사가 뜻을 가진다
  expect(all.size).toBeGreaterThan(tops.length);

  const listed = await sitemapLocs(page);
  expect([...all].filter((path) => !listed.has(path))).toEqual([]);
});

test('사이트맵에 적힌 주소는 전부 열린다', async ({ page }) => {
  // 검색에서 들어왔더니 404 면 사이트맵을 통째로 의심받는다
  const listed = await sitemapLocs(page);
  expect(listed.size).toBeGreaterThan(10);

  const dead: string[] = [];
  for (const path of listed) {
    const res = await page.request.get(path);
    if (res.status() !== 200) dead.push(`${path} → ${res.status()}`);
  }
  expect(dead).toEqual([]);
});

test('상품의 갱신 시각은 요청할 때마다 바뀌지 않는다', async ({ page }) => {
  /*
   * 전에는 모든 항목에 `now` 를 찍었다. 그러면 크롤러가 볼 때마다 "방금
   * 바뀌었다" 고 말하는 셈이라, 그 값을 아예 믿지 않게 된다.
   *
   * **두 번 받아 견주는 것이 이걸 잡는 유일한 방법이다.** 한 번만 보면
   * `now` 와 진짜 갱신 시각을 구분할 수 없다 — 갓 시드한 DB 에서는 둘 다
   * 오늘이기 때문이다.
   */
  const stamps = async () => {
    const xml = await (await page.request.get('/sitemap.xml')).text();
    return new Map(
      [...xml.matchAll(/<url>\s*<loc>([^<]*\/product\/[^<]+)<\/loc>\s*<lastmod>([^<]+)</g)]
        .map((m) => [new URL(m[1]!).pathname, m[2]!] as const),
    );
  };

  const first = await stamps();
  expect(first.size).toBeGreaterThan(1);

  // 사이트맵은 요청마다 만든다(force-dynamic). 그 사이에 상품은 바뀌지 않았다.
  await page.waitForTimeout(1_100);
  const second = await stamps();

  const moved = [...first].filter(([path, when]) => second.get(path) !== when);
  expect(moved).toEqual([]);
});
