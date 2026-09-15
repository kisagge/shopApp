import { test, expect, type Browser, type Page } from '@playwright/test';
import { SEED_ACCOUNT, SEED_PASSWORD } from '@shop/auth/seed-fixtures';
import { ready } from './state';

/**
 * 운영진이 회원을 이용 정지하고 푼다.
 *
 * 단위 검사는 판정·세션 삭제·로그인 코드를 따로 본다. 여기서 보는 것은 **실제로 막히는가**다:
 * - 이미 로그인해 둔 사람도 주문을 못 만든다(세션 쿠키 캐시가 남은 몇 분이 돈 창구로 새지 않는다)
 * - 새로 로그인하면 "틀렸다" 가 아니라 "정지됐다" 를 듣는다
 * - 풀면 같은 비밀번호로 다시 들어온다 — 비밀번호·연결 계정은 남는다
 *
 * 전용 계정을 쓴다(suspendTarget). 저장된 세션이 없는 계정이라 다른 검사를 끊지 않는다.
 */

test.describe.configure({ mode: 'serial' });

const TARGET = SEED_ACCOUNT.suspendTarget;

async function login(browser: Browser): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto('/login');
  await ready(page);
  await page.getByLabel('이메일').fill(TARGET);
  await page.getByLabel('비밀번호').fill(SEED_PASSWORD);
  await page.getByRole('button', { name: '로그인' }).click();
  return { page, close: () => context.close() };
}

function targetRow(page: Page) {
  return page.getByRole('row').filter({ hasText: TARGET });
}

test('정지하면 로그인해 둔 사람은 주문을 못 하고 새 로그인은 정지 안내를 받으며, 풀면 다시 들어온다', async ({ page, browser }) => {
  test.setTimeout(120_000);

  // 정지 전: 들어올 수 있다
  const before = await login(browser);
  await expect(before.page.getByRole('link', { name: '마이페이지' })).toBeVisible({ timeout: 20_000 });

  await page.goto(`/admin/users?q=${encodeURIComponent(TARGET)}`);
  await ready(page);
  const row = targetRow(page);

  try {
    // ── 운영: 사유를 적어 정지
    await row.getByRole('button', { name: '이용 정지' }).click();
    await row.getByLabel(/정지 사유/).fill('e2e 정지 검사');
    await row.getByRole('button', { name: '정지', exact: true }).click();
    await expect(row.getByText('정지됨')).toBeVisible({ timeout: 20_000 });
    await expect(row.getByText(/사유: e2e 정지 검사/)).toBeVisible();

    // ── 회원 상세: 막힌 상태가 맨 위에 사유와 함께 선다 — 모르고 주문을 들여다보면 엉뚱한 답을 한다
    const detailHref = (await row.getByRole('link', { name: '정지 검사 손님', exact: true }).getAttribute('href'))!;
    const detail = await page.context().newPage();
    await detail.goto(detailHref);
    await ready(detail);
    await expect(detail.getByRole('heading', { level: 1, name: '정지 검사 손님' })).toBeVisible();
    await expect(detail.getByText(/로그인과 주문이 막혀 있습니다\. 사유: e2e 정지 검사/)).toBeVisible();
    await expect(detail.getByRole('region', { name: '운영 기록' }).getByText('이용 정지').first()).toBeVisible();
    await detail.close();

    // ── 이미 로그인해 둔 사람: 주문 창구가 막힌다(본문 검사 전에 막으므로 빈 본문이면 된다)
    // 연결이 끊겨 응답 자체가 없을 때만 다시 보낸다(ECONNRESET 을 한 번 겪었다). 응답이 오면 그 답으로 판정한다
    await expect(async () => {
      const order = await before.page.request.post('/api/orders', { data: {}, failOnStatusCode: false });
      expect(order.status(), '정지된 회원이 주문 창구를 지났다').toBeLessThan(500);
      if (order.status() !== 401) {
        // 세션이 이미 지워져 401 이면 그것도 막힌 것이다. 캐시가 남아 통과했다면 정지 코드여야 한다
        expect(await order.json()).toMatchObject({ code: 'ACCOUNT_SUSPENDED' });
      }
    }).toPass({ timeout: 20_000 });

    // ── 새 로그인: 정지 안내
    const blocked = await login(browser);
    try {
      const alert = blocked.page.locator('form [role="alert"]');
      await expect(alert).toContainText('이용이 정지된 계정', { timeout: 20_000 });
      await expect(blocked.page.getByRole('link', { name: '마이페이지' })).toHaveCount(0);
    } finally {
      await blocked.close();
    }

    // ── 운영: 해제
    await row.getByRole('button', { name: '정지 해제' }).click();
    await expect(row.getByText('정지됨')).toHaveCount(0, { timeout: 20_000 });

    // ── 같은 비밀번호로 다시 들어온다
    const after = await login(browser);
    try {
      await expect(after.page.getByRole('link', { name: '마이페이지' })).toBeVisible({ timeout: 20_000 });
    } finally {
      await after.close();
    }

    // 감사 로그에 둘 다 남는다 — 표 안만 본다(거르기 선택지에도 같은 말이 있다)
    await page.goto('/admin/audit');
    await ready(page);
    const log = page.getByRole('region', { name: '관리자 동작 기록' });
    await expect(log.getByRole('cell', { name: '이용 정지', exact: true }).first()).toBeVisible();
    await expect(log.getByRole('cell', { name: '정지 해제', exact: true }).first()).toBeVisible();
  } finally {
    await before.close();
    // 중간에 실패해도 계정을 정지된 채로 두지 않는다 — 다음 실행이 로그인부터 막힌다
    await page.goto(`/admin/users?q=${encodeURIComponent(TARGET)}`);
    const restore = targetRow(page).getByRole('button', { name: '정지 해제' });
    if (await restore.count()) {
      await restore.click();
      await expect(restore).toHaveCount(0, { timeout: 20_000 });
    }
  }
});
