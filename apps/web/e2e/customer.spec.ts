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

test('탈퇴 화면은 무엇이 지워지고 무엇이 남는지 먼저 말한다', async ({ page }) => {
  await page.goto('/mypage');
  await page.getByRole('link', { name: '회원 탈퇴' }).click();

  await expect(page.getByRole('heading', { name: '회원 탈퇴', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: '지워지는 것' })).toBeVisible();
  // 왜 남는지 말하지 않으면 지우지 않은 것으로 읽힌다
  await expect(page.getByText(/가맹점 정산의 근거입니다/)).toBeVisible();
});

test('탈퇴 화면은 막는 이유를 보여 주거나 확인 문구를 요구한다', async ({ page }) => {
  /*
   * **주문 상태에 기대지 않는다.**
   *
   * 처음에는 "입금대기 주문이 있어 막힌다" 로 썼는데, 그건 시드가 아니라
   * 개발하며 로컬에 쌓인 주문이었다. CI 는 빈 DB 에 시드만 넣고 돌아서
   * demo 계정에 주문이 하나도 없고, 그대로 깨졌다.
   *
   * 막는 규칙 자체는 단위 테스트가 본다. 여기서는 **화면이 둘 중 하나를
   * 정확히 보여 주는지**를 본다 — 둘 다면 막아 놓고 누를 수 있는 것이고,
   * 둘 다 없으면 여기서 할 수 있는 일이 없다.
   */
  await page.goto('/mypage/close');

  await expect(page.getByRole('heading', { name: '회원 탈퇴', level: 1 })).toBeVisible();

  const blocked = page.getByRole('heading', { name: '지금은 탈퇴할 수 없습니다' });
  const submit = page.getByRole('button', { name: '탈퇴하기' });

  const isBlocked = await blocked.count() > 0;
  expect(await submit.count(), '막혔으면 양식이 없어야 하고, 아니면 있어야 한다')
    .toBe(isBlocked ? 0 : 1);

  if (isBlocked) {
    // 왜 막혔는지 적혀 있어야 한다. 막았다는 말만으로는 고칠 수가 없다.
    await expect(page.locator('#main')).toContainText(/주문|반품|계정/);
    return;
  }

  // 되돌릴 수 없는 동작이라 문구를 옮겨 적기 전에는 누를 수 없다
  await expect(submit).toBeDisabled();
  await page.getByRole('textbox').fill('탈퇴');
  await expect(submit).toBeDisabled();
  await page.getByRole('textbox').fill('탈퇴합니다');
  await expect(submit).toBeEnabled();
  // 실제로 누르지는 않는다 — 시드 계정이 사라지면 나머지 시험이 무너진다
});

test('입점 신청 입구가 푸터에 있고 양식이 열린다', async ({ page }) => {
  /*
   * 실제로 신청하지는 않는다 — 시드 고객이 가맹점이 되면 나머지 시험이
   * 전부 무너진다. 입구가 있고 양식이 그려지는지만 본다.
   */
  await page.goto('/');
  await page.getByRole('link', { name: '입점 신청' }).click();

  await expect(page.getByRole('heading', { name: '입점 신청', level: 1 })).toBeVisible();

  // 입력이 많아 묶지 않으면 어디까지가 한 묶음인지 알 수 없다
  for (const name of ['브랜드', '사업자 정보', '연락처']) {
    await expect(page.getByRole('group', { name })).toBeVisible();
  }

  // 로그인한 주소가 미리 채워져야 다시 적다가 오타가 나지 않는다
  await expect(page.getByLabel(/^이메일\* \(필수\)$/)).toHaveValue(/@/);
});

test('고객은 문의 관리 화면에 들어갈 수 없다', async ({ page }) => {
  await page.goto('/admin/inquiries');
  expect(new URL(page.url()).pathname).not.toBe('/admin/inquiries');
});
