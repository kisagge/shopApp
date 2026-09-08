import { test, expect } from '@playwright/test';

/**
 * 리뷰 도움돼요.
 *
 * 시드가 넣어 둔 리뷰가 있는 상품에서 확인한다. 상품 이름을 박지 않고
 * 목록에서 첫 상품을 집는다.
 */

/*
 * **한 줄로 세운다.** 이 파일의 검사들은 같은 상품의 같은 리뷰에 표를
 * 주고 뺀다. 설정이 fullyParallel 이라 그냥 두면 넷이 동시에 같은 버튼을
 * 눌러 서로의 결과를 망친다 — 실제로 그렇게 두 개가 깨졌다.
 */
test.describe.configure({ mode: 'serial' });

type Page = import('@playwright/test').Page;
type Button = ReturnType<Page['getByRole']>;

async function openProductWithReviews(page: Page) {
  await page.goto('/product/oversized-wool-coat');
  await expect(page.getByRole('heading', { name: '리뷰' })).toBeVisible();

  /*
   * **로그인 상태를 먼저 확인한다.**
   *
   * 표 단추는 `loggedIn && !isMine` 일 때만 그려지고, 아니면 숫자만 남는다.
   * 그래서 세션이 없으면 아래에서 "단추를 30초 기다렸지만 없다" 로 진다 —
   * 실제로 그렇게 졌는데, 그 문구만 봐서는 리뷰가 안 온 것인지 로그인이
   * 안 된 것인지 알 수 없었다. 여기서 갈라 두면 다음번에는 실패가 스스로
   * 원인을 말한다.
   */
  await expect(
    page.locator('header a[href="/mypage"]'),
    '로그인 상태로 열려야 표 단추가 그려진다',
  ).toBeVisible();
}

/**
 * 원하는 상태로 맞춘다. 이미 그 상태면 누르지 않는다.
 *
 * **시작 상태를 가정하지 않는다.** 이 검사들은 진짜 DB 에 표를 남기므로,
 * 앞선 실행이 도중에 멈추면 표가 남는다. 그걸 모르고 "누르면 켜진다" 라고
 * 적었더니 이미 켜져 있던 표가 꺼지면서 검사가 깨졌다.
 */
async function setPressed(button: Button, want: boolean): Promise<void> {
  const now = (await button.getAttribute('aria-pressed')) === 'true';
  if (now === want) return;
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', String(want));
}

test('누르면 숫자가 오르고, 다시 누르면 내려간다', async ({ page }) => {
  await openProductWithReviews(page);

  const button = page.getByRole('button', { name: /도움됐다고 표시/ }).first();
  await setPressed(button, false);
  const before = Number(/(\d+)명/.exec((await button.getAttribute('aria-label')) ?? '')![1]);

  await button.click();

  // 눌린 것은 색이 아니라 상태로 알린다
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(button).toHaveAttribute('aria-label', new RegExp(`${before + 1}명`));

  await button.click();

  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await expect(button).toHaveAttribute('aria-label', new RegExp(`${before}명`));
});

test('새로고침해도 누른 상태가 남는다', async ({ page }) => {
  await openProductWithReviews(page);

  const button = page.getByRole('button', { name: /도움됐다고 표시/ }).first();
  await setPressed(button, true);

  await page.reload();

  const again = page.getByRole('button', { name: /도움됐다고 표시/ }).first();
  await expect(again).toHaveAttribute('aria-pressed', 'true');

  // 다음 검사에 표를 남기지 않는다
  await setPressed(again, false);
});

test('도움순으로 바꾸면 주소에 남고 리뷰 자리로 돌아온다', async ({ page }) => {
  await openProductWithReviews(page);

  await page.getByRole('navigation', { name: '리뷰 정렬' }).getByRole('link', { name: '도움순' }).click();

  await expect(page).toHaveURL(/reviewSort=helpful/);
  // 정렬 탭이 지금 무엇을 보고 있는지 말한다
  await expect(
    page.getByRole('navigation', { name: '리뷰 정렬' }).getByRole('link', { name: '도움순' }),
  ).toHaveAttribute('aria-current', 'true');
});

test('도움순은 표를 받은 리뷰를 위로 올린다', async ({ page }) => {
  await openProductWithReviews(page);

  // 마지막 리뷰에 표를 준다
  const buttons = page.getByRole('button', { name: /도움됐다고 표시/ });
  // 앞의 것들에는 표가 없어야 마지막 것이 맨 앞으로 온다
  const count = await buttons.count();
  for (let i = 0; i < count - 1; i += 1) await setPressed(buttons.nth(i), false);
  await setPressed(buttons.last(), true);

  await page.goto('/product/oversized-wool-coat?reviewSort=helpful');

  /*
   * 표를 받은 리뷰가 맨 앞으로 온다. 글을 맞춰 보는 대신 **첫 리뷰의 버튼이
   * 눌린 상태인지**를 본다 — 내가 방금 누른 그 리뷰라는 뜻이다.
   */
  const firstButton = page
    .locator('section[aria-labelledby="reviews-title"] article')
    .first()
    .getByRole('button', { name: /도움됐다고 표시/ });
  await expect(firstButton).toHaveAttribute('aria-pressed', 'true');

  // 다음 실행에 표를 남기지 않는다
  await setPressed(firstButton, false);
});
