import { test, expect, type Page } from '@playwright/test';
import { STATE_FILE, RACE_PRODUCT, addProductToCart, ready, stockOf } from './state';

/**
 * 받은 두 줄 중 한 줄만 반품한다 — 신청(손님) → 승인(운영) → 회수 확인·환불(운영 화면).
 *
 * 돈 계산과 장부는 complete-return·core 의 단위 검사가 본다. 여기서 보는 것은 **세 사람이 밟는
 * 길이 이어지는가**다: 손님이 고른 줄만 반품 중이 되고, 운영 화면이 돌려줄 금액을 미리 보여
 * 주고, 누르면 그 금액이 손님 결제 정보에 남고, 주문은 남은 줄을 따라 배송완료로 돌아온다.
 * 그리고 돌아온 줄의 재고가 늘어난다.
 *
 * **자기 상품과 자기 손님을 쓴다**(e2e-fixture-isolation). 반품된 줄은 재고가 돌아오고,
 * 남은 줄은 배송완료로 남는다 — 되돌릴 수 없는 전이라 명세마다 새 주문을 만든다.
 */

test.use({ storageState: STATE_FILE.partialReturner });
test.describe.configure({ mode: 'serial' });

async function addSecondLine(page: Page): Promise<void> {
  const groups = page.locator('[role="radiogroup"]');
  const last = groups.nth((await groups.count()) - 1);
  const choices = last.locator('[role="radio"]:not([data-sold-out])');
  expect(await choices.count(), '두 번째로 고를 옵션이 없다').toBeGreaterThanOrEqual(2);
  await choices.nth(1).click();
  const add = page.getByRole('button', { name: '장바구니 담기' });
  await expect.poll(() => add.getAttribute('aria-disabled')).not.toBe('true');
  await add.click();
  await expect
    .poll(async () => {
      const res = await page.request.get('/api/cart', { failOnStatusCode: false });
      return res.ok() ? (((await res.json()) as { items?: unknown[] }).items?.length ?? 0) : 0;
    }, { timeout: 15_000 })
    .toBe(2);
}


test('받은 두 줄 중 한 줄만 반품하면 그 줄만 돌려받고 주문은 배송완료로 돌아온다', async ({ page, browser }) => {
  test.setTimeout(150_000);

  const first = await addProductToCart(page, RACE_PRODUCT.partialReturn);
  expect(first, '담을 수 있는 옵션이 없다').not.toBeNull();
  await addSecondLine(page);
  const cart = (await (await page.request.get('/api/cart')).json()) as { items: { variantId: string }[] };
  const variants = cart.items.map((i) => i.variantId);
  const stockSum = async () => (await stockOf(page, variants[0]!)) + (await stockOf(page, variants[1]!));
  const stockBefore = await stockSum();

  // ── 결제
  await page.goto('/checkout');
  await ready(page);
  await expect(page.getByRole('button', { name: /원 결제하기/ })).toBeVisible();
  await page.getByRole('checkbox', { name: /약관에 동의/ }).click();
  await page.getByRole('radio', { name: '신용·체크카드' }).click();
  await page.getByRole('button', { name: /원 결제하기/ }).click();
  await page.waitForURL(/\/order\//, { timeout: 30_000 });
  const orderNo = decodeURIComponent(/\/order\/([^/?#]+)/.exec(page.url())![1]!);

  const admin = await browser.newContext({ storageState: STATE_FILE.admin });
  try {
    // ── 운영: 준비 → 송장(배송중) → 배송완료
    for (const step of [
      () => admin.request.post(`/api/admin/orders/${orderNo}/status`, { data: { to: 'PREPARING' } }),
      () => admin.request.post(`/api/admin/orders/${orderNo}/shipment`, { data: { carrier: 'CJ', trackingNumber: '123456789012' } }),
      () => admin.request.post(`/api/admin/orders/${orderNo}/status`, { data: { to: 'DELIVERED' } }),
    ]) {
      const res = await step();
      expect(res.ok(), `운영 처리가 막혔다 (${res.status()}) ${await res.text()}`).toBe(true);
    }

    // ── 손님: 한 줄만 골라 반품 신청
    await page.goto(`/order/${orderNo}`);
    await ready(page);
    await page.getByRole('button', { name: /반품|교환/ }).first().click();
    const lines = page.getByRole('group', { name: '돌려보낼 상품' });
    await expect(lines.getByRole('checkbox')).toHaveCount(2);
    await lines.getByRole('checkbox').first().uncheck();
    await page.getByRole('radio', { name: /단순 변심/ }).check();
    await page.getByRole('button', { name: '신청하기' }).click();
    await expect(page.getByText('반품 진행 중')).toHaveCount(1, { timeout: 20_000 });

    // ── 운영: 승인하고, 화면에서 금액을 보고 회수 확인
    const approve = await admin.request.post(`/api/admin/orders/${orderNo}/return`, { data: { action: 'APPROVE' } });
    expect(approve.ok(), `승인이 막혔다 (${approve.status()})`).toBe(true);

    const ap = await admin.newPage();
    await ap.goto(`/admin/orders/${orderNo}`);
    await ready(ap);
    const preview = ap.locator('dl[aria-label="돌려줄 금액"]');
    await expect(preview).toBeVisible();
    const shown = (await preview.getByRole('definition').first().textContent())!;
    // 상태 단추로 반품완료를 고를 수 없다 — 한 줄 신청에서는 받은 그대로인 줄 때문에 막힌다
    await expect(ap.getByRole('option', { name: '반품완료' })).toHaveCount(0);

    await ap.getByRole('button', { name: '회수 확인 · 환불' }).click();
    // 끝나면 신청이 닫혀 단추가 사라진다. 두 번 누를 자리가 남으면 안 된다
    await expect(ap.getByRole('button', { name: '회수 확인 · 환불' })).toHaveCount(0, { timeout: 20_000 });

    // ── 손님: 그 줄만 반품 환불, 돌려받은 금액이 운영 화면에서 본 금액과 같고, 주문은 배송완료
    await expect
      .poll(async () => {
        await page.goto(`/order/${orderNo}`);
        await ready(page);
        return await page.getByText('반품 환불').count();
      }, { timeout: 20_000 })
      .toBe(1);
    const refundedRow = page.getByRole('term').filter({ hasText: '돌려받은 금액' });
    await expect(refundedRow.locator('xpath=following-sibling::dd')).toHaveText(`-${shown}`);
    await expect(page.getByText(/현재 상태.*배송완료/)).toBeVisible();

    // 돌아온 줄 하나만큼 재고가 늘었다 — 남은 줄은 손님이 갖고 있다
    expect(await stockSum(), '반품한 줄의 재고가 안 돌아왔거나 남은 줄까지 돌아왔다').toBe(stockBefore - 1);
  } finally {
    await admin.close();
  }
});
