import { test, expect } from '@playwright/test';

/**
 * **읽기만 하는 검사**는 그림을 기다리지 않는다.
 *
 * 기본 goto 는 load 를 기다리는데, 캐시가 빈 상태에서는 상품 사진 원본을
 * 저장소에서 받아 최적화하느라 첫 방문이 오래 걸린다 — CI 에서 30초를
 * 넘겨 깨졌다. 마크업만 보는 검사는 DOM 까지만 기다리면 된다.
 *
 * **눌러 보는 검사에는 쓰지 않는다.** 그때는 하이드레이션이 끝나야 하고,
 * DOM 만으로 진행하면 버튼이 아직 반응하지 않는다 — 그렇게 바꿨다가
 * 모바일 메뉴 검사 넷이 깨졌다.
 */
const MARKUP_ONLY = { waitUntil: 'domcontentloaded' } as const;

/**
 * 접근성.
 *
 * 이 저장소의 규칙은 "상태를 색·모양으로만 알리지 않는다" 다. 단위 테스트로
 * 컴포넌트 하나씩 볼 수는 있지만, **실제로 그려진 화면에서 이름이 무엇으로
 * 읽히는지**는 브라우저를 거쳐야 안다.
 */

test('찜 버튼의 이름이 상태를 말한다 — 하트 모양은 눈에만 보인다', async ({ page }) => {
  await page.goto('/');

  const wish = page.getByRole('button', { name: /찜하기$/ }).first();
  await expect(wish).toBeVisible();

  // 상품 이름이 들어 있어야 어느 상품의 버튼인지 알 수 있다
  const label = await wish.getAttribute('aria-label');
  expect(label).toMatch(/.+ 찜하기$/);
});

test('캐러셀 화살표가 본문 위에 겹치지 않는다', async ({ page }) => {
  await page.goto('/');

  const prev = page.getByRole('button', { name: /이전 배너/ });
  const count = await prev.count();
  test.skip(count === 0, '배너가 하나뿐이라 조작 장치가 없다');

  const arrow = await prev.boundingBox();
  expect(arrow).not.toBeNull();

  // 배너 안의 글자·버튼과 사각형이 겹치면 안 된다
  const texts = page.locator('section[aria-roledescription], section').first().locator('h2, p, a');
  for (const el of await texts.all()) {
    const box = await el.boundingBox();
    if (!box || !arrow) continue;
    const overlaps =
      box.x < arrow.x + arrow.width &&
      box.x + box.width > arrow.x &&
      box.y < arrow.y + arrow.height &&
      box.y + box.height > arrow.y;
    expect(overlaps).toBe(false);
  }
});

test('본문 바로가기가 첫 탭에 잡힌다', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');

  const focused = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
  expect(focused).toBe('본문 바로가기');
});

test('모든 이미지에 대체 텍스트가 있다', async ({ page }) => {
  await page.goto('/', MARKUP_ONLY);

  const missing = await page.evaluate(() =>
    [...document.querySelectorAll('img')]
      .filter((img) => !img.hasAttribute('alt'))
      .map((img) => img.getAttribute('src') ?? '(src 없음)'),
  );
  expect(missing).toEqual([]);
});

test('한 화면에 h1 은 하나다', async ({ page }) => {
  await page.goto('/', MARKUP_ONLY);

  // 제목이 여럿이면 스크린리더가 문서 구조를 잡지 못한다
  await expect(page.locator('h1')).toHaveCount(1);
});

/**
 * 좁은 화면의 메뉴.
 *
 * 데스크톱 헤더의 카테고리 내비게이션은 md 아래에서 숨는다. 그 자리를 메우는
 * 것이 이 메뉴라서, **좁은 화면에서 카테고리로 갈 길이 있는지**가 곧 이
 * 메뉴가 동작하는지다.
 */
test.describe('모바일 메뉴', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('좁은 화면에서 카테고리로 갈 길이 있다', async ({ page }) => {
    await page.goto('/');

    // 열기 전에는 카테고리 링크가 눈에 보이지 않는다
    const category = page.locator('header a[href^="/category/"]');
    await expect(category.first()).toBeHidden();

    await page.getByRole('button', { name: '메뉴' }).click();

    await expect(category.first()).toBeVisible();
    // 검색도 헤더에서는 sm 아래로 숨으므로 여기 있어야 한다
    await expect(page.locator('header').getByRole('combobox')).toBeVisible();
  });

  test('Esc 로 닫히고 포커스가 여는 자리로 돌아온다', async ({ page }) => {
    await page.goto('/');

    const toggle = page.getByRole('button', { name: '메뉴' });
    await toggle.click();
    await expect(page.locator('header a[href^="/category/"]').first()).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.locator('header a[href^="/category/"]').first()).toBeHidden();
    // 닫고 포커스를 잃으면 키보드 사용자는 처음부터 다시 찾아야 한다
    await expect(toggle).toBeFocused();
  });

  test('버튼이 열림 상태를 직접 말한다', async ({ page }) => {
    await page.goto('/');

    const toggle = page.getByRole('button', { name: '메뉴' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  test('스크립트가 없어도 푸터로 카테고리에 닿는다', async ({ browser }) => {
    // 메뉴 버튼은 자바스크립트가 있어야 열린다. 없을 때의 길이 푸터다.
    const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 375, height: 812 } });
    const page = await ctx.newPage();
    await page.goto('/');

    const footerLinks = page.getByRole('navigation', { name: '카테고리 (푸터)' }).getByRole('link');
    await expect(footerLinks.first()).toBeVisible();

    await ctx.close();
  });

  test('카테고리를 고르면 메뉴가 따라 닫힌다', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: '메뉴' }).click();
    const first = page.locator('header a[href^="/category/"]').first();
    const href = await first.getAttribute('href');
    await first.click();

    await expect(page).toHaveURL(new RegExp(`${href}$`));
    // 열어 둔 채로 남으면 새 화면을 덮는다
    await expect(page.locator('header a[href^="/category/"]').first()).toBeHidden();
  });
});

