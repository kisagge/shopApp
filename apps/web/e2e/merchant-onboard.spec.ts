import { test, expect, type Page } from '@playwright/test';
import { ready, STATE_FILE } from './state';

/**
 * 손님이 입점을 신청하고, 슈퍼관리자가 승인하면 **판매자가 된다.**
 *
 * 승인은 상태 한 칸을 바꾸는 일이 아니다 — 신청한 사람의 계정을 판매자로 올리고 브랜드를 만들어 붙이는
 * **권한 승격**이다(merchant/apply 의 activateApprovedMerchant). 그런데 이 길은 끝에서 끝까지 걸어 본 적이
 * 없었다: 손님 검사는 "실제로 신청하지는 않는다 — 시드 고객이 가맹점이 되면 나머지 시험이 전부 무너진다" 며
 * 입구만 봤고, 가맹점 검사는 이미 가맹점인 경우만 봤다.
 *
 * 그 사이로 샐 수 있는 것들이 화면에는 멀쩡해 보인다 — 승인은 됐는데 브랜드가 안 붙어 로그인해도 아무것도 못
 * 하는 상태(코드 주석이 직접 걱정하는 그것), 심사 중인 사람에게 가맹점 범위가 새는 것, 두 번 승인.
 *
 * **매번 새로 가입한다.** 시드 계정을 판매자로 올리면 그 계정을 쓰는 다른 명세가 전부 무너진다. 사업자번호도
 * 유일해야 하므로 그 자리에서 짓는다.
 */

test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ mode: 'serial' });

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await ready(page);
  await page.getByLabel('이메일').fill(email);
  await page.getByLabel('비밀번호').fill(password);
  await page.getByRole('button', { name: '로그인' }).click();
}

test('신청하면 심사 중이고, 승인하면 그 계정이 자기 브랜드를 가진 판매자가 된다', async ({ page, browser }) => {
  test.setTimeout(150_000);
  const stamp = String(Date.now()).slice(-6);
  const email = `e2e-onboard-${stamp}@plain.test`;
  const password = 'quiet-harbor-42';
  const shopName = `새로온가게${stamp}`;
  const brandName = `NEWCOMER ${stamp}`;

  // ── 손님으로 가입
  await page.goto('/signup');
  await ready(page);
  await page.getByLabel(/^이메일/).fill(email);
  await page.getByLabel(/^이름/).fill('입점 신청자');
  await page.getByLabel(/^비밀번호\*/).fill(password);
  await page.getByLabel(/^비밀번호 확인/).fill(password);
  await page.getByLabel(/이용약관에 동의합니다/).check();
  await page.getByLabel(/개인정보 수집/).check();
  await page.getByRole('button', { name: '가입하기' }).click();
  await expect(page.getByRole('link', { name: '마이페이지' })).toBeVisible({ timeout: 20_000 });

  // ── 아직 손님이다. 콘솔은 열리지 않는다
  await page.goto('/admin');
  expect(new URL(page.url()).pathname, '심사도 하기 전에 콘솔이 열렸다').not.toBe('/admin');

  // ── 신청
  await page.goto('/merchant/apply');
  await ready(page);
  await page.getByLabel(/^가맹점 이름/).fill(shopName);
  await page.getByLabel(/^브랜드 이름/).fill(brandName);
  await page.getByLabel(/^상호/).fill(`${shopName} 주식회사`);
  // 사업자번호는 유일해야 한다 — 이 판만의 번호를 짓는다
  // 000-00-00000 — 세 자리·두 자리·다섯 자리다. 이 판만의 번호를 짓는다(같은 번호는 한 번만 들어간다)
  await page.getByLabel(/^사업자등록번호/).fill(`${stamp.slice(0, 3)}-${stamp.slice(3, 5)}-${stamp.slice(5)}${stamp.slice(0, 4)}`);
  await page.getByLabel(/^대표자/).fill('김대표');
  await page.getByLabel(/^이메일/).fill(email);
  await page.getByLabel(/^전화번호/).fill('02-1234-5678');

  /*
   * **응답으로 확인한다.** 화면 글자만 기다리면 양식이 거절당했을 때 "안 떴다" 로만 지고, 무엇이 틀렸는지는
   * 알 수 없다 — 사업자번호 자릿수를 틀렸던 첫 판이 그랬다.
   */
  const [applied] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/api/merchant/apply')),
    page.getByRole('button', { name: '입점 신청' }).click(),
  ]);
  expect(applied.status(), await applied.text()).toBe(201);

  // ── 심사 중이라고 말한다. 그리고 아직 판매자가 아니다
  await expect(page.getByText(/승인 대기/)).toBeVisible({ timeout: 20_000 });
  await page.goto('/admin');
  expect(new URL(page.url()).pathname, '심사 중인 사람에게 가맹점 범위가 샜다').not.toBe('/admin');

  // ── 슈퍼관리자가 승인한다(입점 승인은 관리자도 못 한다)
  const superAdmin = await browser.newContext({ storageState: STATE_FILE.superAdmin });
  try {
    const sp = await superAdmin.newPage();
    await sp.goto('/admin/merchants');
    await ready(sp);
    const row = sp.getByRole('row').filter({ hasText: shopName });
    await expect(row, '신청이 운영 목록에 안 뜬다').toHaveCount(1);

    await row.getByLabel(`${shopName} 입점 상태`).selectOption('APPROVED');
    const [approved] = await Promise.all([
      sp.waitForResponse((r) => r.request().method() === 'PATCH' && /\/api\/admin\/merchants\/.+\/status$/.test(r.url())),
      row.getByRole('button', { name: '적용' }).click(),
    ]);
    expect(approved.status(), await approved.text()).toBe(200);
  } finally {
    await superAdmin.close();
  }

  /*
   * ── 신청자: 다시 들어오면 판매자다.
   *
   * **새 브라우저로 들어간다.** 승인은 계정의 역할을 올리는 일이라 그 변화가 세션에 실려야 하고, 들고 있던
   * 세션으로는 그것을 볼 수 없다. 같은 창에서 로그인하고 곧바로 옮겨 가면 앱이 스스로 하는 이동과 겹쳐
   * 내비게이션이 취소된다(한 판이 ERR_ABORTED 로 그렇게 졌다).
   */
  const seller = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  try {
    const sp = await seller.newPage();
    await login(sp, email, password);
    await expect(sp.getByRole('link', { name: '마이페이지' })).toBeVisible({ timeout: 20_000 });

    await sp.goto('/admin');
    await ready(sp);
    await expect(
      sp.getByRole('heading', { level: 1, name: '대시보드' }),
      '승인은 됐는데 콘솔이 안 열린다 — 계정이 안 올라갔거나 브랜드가 안 붙었다',
    ).toBeVisible();

    // ── 브랜드가 실제로 붙었다. 그리고 자기 것만 보인다
    await sp.goto('/admin/products');
    await ready(sp);
    await expect(sp.getByRole('heading', { level: 1, name: '상품 관리' })).toBeVisible();

    await sp.goto('/admin/merchants');
    await ready(sp);
    await expect(sp.locator('#main'), '남의 가맹점이 보인다').not.toContainText('스튜디오눈');
  } finally {
    await seller.close();
  }
});
