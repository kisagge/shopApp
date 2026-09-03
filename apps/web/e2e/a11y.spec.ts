import { test, expect } from '@playwright/test';

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
  await page.goto('/');

  const missing = await page.evaluate(() =>
    [...document.querySelectorAll('img')]
      .filter((img) => !img.hasAttribute('alt'))
      .map((img) => img.getAttribute('src') ?? '(src 없음)'),
  );
  expect(missing).toEqual([]);
});

test('한 화면에 h1 은 하나다', async ({ page }) => {
  await page.goto('/');

  // 제목이 여럿이면 스크린리더가 문서 구조를 잡지 못한다
  await expect(page.locator('h1')).toHaveCount(1);
});
