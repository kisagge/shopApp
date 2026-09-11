import { test, expect } from '@playwright/test';

/**
 * 실제로 나가는 구조화 데이터.
 *
 * **소스에 문자열이 있는지 보는 것으로는 모자라다.** 단위 검사는
 * `application/ld+json` 과 함수 이름이 파일에 있는지만 본다 — 그건 붙이는 것을
 * 빠뜨리는 실수는 잡아도, **붙였는데 깨진 것**은 못 잡는다. JSON 이 아니거나,
 * 순서가 화면과 다르거나, 주소가 상대 경로인 경우가 그렇다.
 *
 * 그래서 실제로 열어 읽어 본다.
 */

/** 화면이 내보낸 ld+json 을 전부 파싱한다 */
async function jsonLdOf(page: import('@playwright/test').Page, path: string) {
  await page.goto(path);
  const raw = await page.locator('script[type="application/ld+json"]').allTextContents();
  expect(raw.length, `${path} 에 구조화 데이터가 없다`).toBeGreaterThan(0);
  // 한 태그가 배열일 수도, 단일 객체일 수도 있다
  return raw.flatMap((text) => {
    const parsed: unknown = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
  }) as Record<string, unknown>[];
}

const LISTINGS = [
  { path: '/category/outer', label: '매대' },
  { path: '/collection/winter-outer', label: '기획전' },
] as const;

for (const { path, label } of LISTINGS) {
  test(`${label}이 담은 것을 말한다`, async ({ page }) => {
    const all = await jsonLdOf(page, path);

    const list = all.find((d) => d['@type'] === 'ItemList');
    expect(list, `${path} 에 ItemList 가 없다`).toBeDefined();

    const items = list!['itemListElement'] as { position: number; url: string }[];
    expect(items.length, '담긴 것이 없다고 말한다').toBeGreaterThan(0);
    expect(list!['numberOfItems']).toBe(items.length);

    // 순서는 1부터 빠짐없이 — 건너뛰면 목록을 설명하는 것이 아니다
    expect(items.map((i) => i.position)).toEqual(items.map((_, n) => n + 1));

    /*
     * 주소는 절대 주소여야 한다. 상대 경로로 내보내면 검색엔진이 어느
     * 도메인의 것인지 알 수 없다.
     */
    for (const item of items) {
      expect(item.url, `${item.url} 가 절대 주소가 아니다`).toMatch(/^https?:\/\//);
    }
  });

  test(`${label}의 이동 경로가 화면과 같은 순서다`, async ({ page }) => {
    const all = await jsonLdOf(page, path);
    const crumbs = all.find((d) => d['@type'] === 'BreadcrumbList');
    expect(crumbs, `${path} 에 BreadcrumbList 가 없다`).toBeDefined();

    const fromData = (crumbs!['itemListElement'] as { name: string }[]).map((c) => c.name);

    /*
     * 화면의 빵부스러기와 **같은 순서**여야 한다. 다르면 사람이 보는 길과
     * 검색 결과에 찍히는 길이 갈린다. 마지막 칸은 현재 위치라 링크가 아니므로
     * 글자로 읽는다.
     */
    const nav = page.getByRole('navigation', { name: '현재 위치' });
    const fromScreen = (await nav.locator('li').allInnerTexts())
      .map((s) => s.trim())
      .filter((s) => s !== '' && s !== '/');

    expect(fromData).toEqual(fromScreen);
  });
}
