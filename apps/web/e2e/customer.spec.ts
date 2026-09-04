import { test, expect } from '@playwright/test';

/**
 * 로그인한 고객이 보는 화면.
 *
 * 주문서는 이 대화에서 결함이 가장 많이 나온 곳이다 — 배송지 등록 경로가
 * 없어 막다른 길이었고, 중첩 form 이었고, 문구가 상태를 따라가지 않았다.
 * 전부 실제 브라우저에서만 드러났다.
 */

const ADMIN_PATHS = [
  '/admin', '/admin/orders', '/admin/products', '/admin/banners',
  '/admin/coupons', '/admin/settlements', '/admin/merchants',
  '/admin/users', '/admin/points', '/admin/audit', '/admin/traffic',
];

/**
 * 어드민 화면을 새로 만들 때마다 위 목록에 한 줄을 더한다.
 * 가드를 빠뜨리는 것은 조용히 지나가는 종류의 실수다.
 */
for (const path of ADMIN_PATHS) {
  test(`고객은 ${path} 에 들어갈 수 없다`, async ({ page }) => {
    await page.goto(path);

    expect(new URL(page.url()).pathname).not.toBe(path);
  });
}

test('주문서에 form 이 겹쳐 있지 않다', async ({ page }) => {
  await page.goto('/checkout');

  // <form> 안의 <form> 은 HTML 이 허용하지 않는 구조다.
  // 브라우저마다 다르게 다뤄서 어떤 곳에서는 제출 자체가 안 된다.
  await expect(page.locator('form form')).toHaveCount(0);
});

test('마이페이지의 숫자들이 갈 곳을 가진다', async ({ page }) => {
  await page.goto('/mypage');

  // 숫자만 보여 주고 갈 곳이 없으면 막다른 길이 된다
  for (const name of ['포인트', '쿠폰', '찜']) {
    await expect(page.getByRole('link').filter({ hasText: name }).first()).toBeVisible();
  }
});

test('쿠폰함에서 코드로 등록할 수 있다', async ({ page }) => {
  await page.goto('/mypage/coupons');

  await expect(page.getByLabel('쿠폰 코드 등록')).toBeVisible();

  // 없는 코드와 못 받는 코드를 구분해 주면 무작위로 넣어 보며 알아낼 수 있다
  await page.getByLabel('쿠폰 코드 등록').fill('NOSUCHCODE');
  await page.getByRole('button', { name: '등록' }).click();
  await expect(page.locator('main [role="alert"], form [role="alert"]')).toContainText('사용할 수 없는 코드');
});

test('배송지 관리에서 도서산간을 미리 알려 준다', async ({ page }) => {
  await page.goto('/mypage/addresses');

  const postal = page.getByLabel('우편번호');
  if ((await postal.count()) === 0) {
    await page.getByRole('button', { name: '새 배송지 추가' }).click();
  }

  // 제주. 결제 직전에 처음 알게 되면 속았다고 느낀다.
  await page.getByLabel('우편번호').fill('63309');

  await expect(page.getByText(/도서산간/)).toBeVisible();
});

test('주소 검색 버튼이 입력칸과 어긋나지 않는다', async ({ page }) => {
  await page.goto('/mypage/addresses');

  if ((await page.getByLabel('우편번호').count()) === 0) {
    await page.getByRole('button', { name: '새 배송지 추가' }).click();
  }

  const input = await page.getByLabel('우편번호').boundingBox();
  const button = await page.getByRole('button', { name: '주소 검색' }).boundingBox();
  expect(input).not.toBeNull();
  expect(button).not.toBeNull();

  // Field 는 라벨·입력·힌트를 세로로 쌓는다. 힌트가 있으면 items-end 가
  // 힌트 아래를 기준으로 잡아 버튼이 내려간다 — 실제로 그렇게 어긋났었다.
  expect(Math.abs(input!.y + input!.height - (button!.y + button!.height))).toBeLessThan(2);
});

test('남의 리뷰는 신고할 수 있고, 신고해도 글은 남는다고 말한다', async ({ page }) => {
  await page.goto('/product/wool-double-jacket');

  const report = page.getByRole('button', { name: '신고' }).first();
  await expect(report).toBeVisible();
  await expect(report).toHaveAttribute('aria-expanded', 'false');

  await report.click();

  await expect(page.getByRole('group', { name: '신고 사유' })).toBeVisible();
  // 누른 뒤 아무 변화가 없으면 눌리지 않은 줄 알고 다시 누른다
  await expect(page.getByText(/글은 그대로 남습니다/)).toBeVisible();
});
