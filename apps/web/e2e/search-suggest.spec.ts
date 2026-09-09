import { test, expect } from '@playwright/test';

/**
 * 검색 자동완성과 인기 검색어.
 *
 * 여기서 확인하는 것은 **키보드만으로 끝까지 가는가** 다. 마우스로 되는 것은
 * 단위 테스트가 이미 보고 있고, 콤보박스가 깨지는 자리는 언제나 초점과
 * 키다.
 */

const box = '#site-search';

/** 헤더 검색창은 데스크톱 폭에서만 보인다 */
test.use({ viewport: { width: 1280, height: 900 } });

type Page = import('@playwright/test').Page;

/**
 * 제안이 뜰 때까지 친다.
 *
 * **하이드레이션 전에 친 글자는 React 가 듣지 못한다** — 값은 칸에 들어가
 * 있는데 아무 일도 일어나지 않는다. 최근 본 상품에서 CI 에서만 지던 실패가
 * 정확히 이것이었다. 반응이 올 때까지 다시 친다.
 */
async function suggest(page: Page, term: string) {
  const input = page.locator(box);
  await expect
    .poll(async () => {
      await input.fill(term.slice(0, -1));
      await input.fill(term);
      return input.getAttribute('aria-expanded');
    })
    .toBe('true');
}

test('로마자는 두 글자부터, 한글은 한 음절부터 제안한다', async ({ page }) => {
  /*
   * 한글만 다르게 대한다. `a` 한 글자는 서른넷 중 열아홉을 물어 제안이
   * 아니라 목록이 되지만, `울` 은 여덟만 문다.
   *
   * 검색은 이미 `울` 로 여덟 개를 찾는데 자동완성만 조용했다. 치는 동안에는
   * 안 파는 물건처럼 보이고, 엔터를 눌러야 있다는 것을 안다.
   */
  await page.goto('/');
  // 먼저 살아 있는 것을 확인하고 — 그래야 아래의 "안 뜬다" 가 뜻을 갖는다
  await suggest(page, '코트');

  await suggest(page, '울');
  await expect(page.getByRole('option').first()).toBeVisible();

  await page.locator(box).fill('a');
  await expect(page.locator(box)).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('option')).toHaveCount(0);

  // 자판에서 조합 중에 지나가는 낱자는 아직 낱말이 아니다
  await page.locator(box).fill('ㅋ');
  await expect(page.locator(box)).toHaveAttribute('aria-expanded', 'false');
});

test('키보드만으로 고른 곳까지 간다', async ({ page }) => {
  await page.goto('/');
  await suggest(page, '코트');

  await page.locator(box).press('ArrowDown');

  // 초점은 입력칸에 남고, 고른 것은 activedescendant 로만 가리킨다
  await expect(page.locator(box)).toBeFocused();
  const active = await page.locator(box).getAttribute('aria-activedescendant');
  expect(active).toBeTruthy();
  // React 가 만든 id 라 콜론이 섞일 수 있다 — 속성 선택자로 집는다
  await expect(page.locator(`[id="${active}"]`)).toHaveAttribute('aria-selected', 'true');

  await page.locator(box).press('Enter');

  // 검색 결과 목록이 아니라 고른 곳으로 갔다
  await expect(page).not.toHaveURL(/\/search\?/);
  await expect(page.locator('#main')).toBeVisible();
});

test('Escape 로 닫고 폼으로 검색한다 — 자동완성은 얹은 것이다', async ({ page }) => {
  await page.goto('/');
  await suggest(page, '코트');

  await page.locator(box).press('Escape');
  await expect(page.locator(box)).toHaveAttribute('aria-expanded', 'false');

  /*
   * **친 글자가 남아 있어야 한다.** type="search" 인 칸에서 Escape 는
   * 브라우저가 값을 지우는 기본 동작인데, 값을 React 가 들고 있어서
   * 지워지는 것은 화면뿐이었다 — 눈에는 비었는데 폼은 옛 값을 들고 있는
   * 어긋난 상태다. 그대로 엔터를 누르면 빈 검색이 나갔고, 이 명세가 주소
   * 모양만 보고 있어서 `/search?q=` 로도 통과해 아무도 몰랐다.
   */
  await expect(page.locator(box)).toHaveValue('코트');

  await page.locator(box).press('Enter');
  await expect(page).toHaveURL(/\/search\?q=%EC%BD%94%ED%8A%B8/);
});

test('빈 검색 화면은 인기 검색어가 없어도 막다른 길이 아니다', async ({ page }) => {
  await page.goto('/search');

  // 무엇을 하면 되는지는 인기 검색어와 무관하게 늘 말해 준다
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator(box)).toBeVisible();

  /*
   * 인기 검색어는 **사람이 다녀가야 생긴다.** 갓 시드한 DB 에는 없고, 그때는
   * 자리를 통째로 비우는 것이 설계다. 그래서 "있어야 한다" 고 쓰지 않고,
   * 있을 때 제대로 동작하는지를 본다 — 눌렀더니 빈 화면인 인기 검색어가
   * 이 기능에서 가장 나쁜 상태다.
   */
  const popular = page.getByRole('navigation', { name: '인기 검색어' });
  if ((await popular.count()) === 0) return;

  const first = popular.getByRole('link').first();
  const term = (await first.textContent())!.trim();
  await first.click();

  await expect(page).toHaveURL(new RegExp(`/search\\?q=${encodeURIComponent(term)}`));
  await expect(page.locator('#main a[href^="/product/"]').first()).toBeVisible();
});
