import { test, expect } from '@playwright/test';
import { STATE_FILE, RACE_PRODUCT, addProductToCart, ready, stockOf } from './state';

/**
 * 받은 상품을 다른 옵션으로 교환한다 — 신청(손님) → 승인·교환 상품 발송(운영) → 손님이 바뀐 옵션과 송장을 본다.
 *
 * 이 길은 **끝이 틀려 있었다.** 손님이 교환을 골라도 운영 화면에는 반품과 같은 "회수 확인 · 환불" 만 있어, 누르면
 * 돈이 나가고 바꿀 물건은 안 갔다. 여기서 보는 것:
 * - 손님이 바꿀 옵션을 고르면 그 옵션의 재고가 신청 순간 잡힌다
 * - 운영 화면에 환불 단추가 없고, 교환 상품 발송(송장)으로 끝난다 — 결제는 그대로다
 * - 끝나면 주문 줄이 바꾼 옵션을 가리키고, 돌아온 옵션의 재고가 돌아온다
 * - 손님 알림함에 교환 상품을 보냈다는 알림이 이 주문으로 이어진다
 *
 * 자기 손님(exchanger)과 자기 상품(RACE_PRODUCT.exchange)을 쓴다.
 */

test.use({ storageState: STATE_FILE.exchanger });
test.describe.configure({ mode: 'serial' });

test('다른 옵션으로 교환 신청하면 그 재고가 잡히고, 운영이 송장을 적으면 손님 주문이 바꾼 옵션이 된다', async ({ page, browser }) => {
  test.setTimeout(150_000);

  const fromVariant = await addProductToCart(page, RACE_PRODUCT.exchange);
  expect(fromVariant, '담을 수 있는 옵션이 없다').not.toBeNull();

  // ── 결제
  await page.goto('/checkout');
  await ready(page);
  await expect(page.getByRole('button', { name: /원 결제하기/ })).toBeVisible();
  await page.getByRole('checkbox', { name: /약관에 동의/ }).click();
  await page.getByRole('radio', { name: '신용·체크카드' }).click();
  await page.getByRole('button', { name: /원 결제하기/ }).click();
  await page.waitForURL(/\/order\//, { timeout: 30_000 });
  const orderNo = decodeURIComponent(/\/order\/([^/?#]+)/.exec(page.url())![1]!);
  const payable = (await page.getByRole('term').filter({ hasText: '결제 금액' })
    .locator('xpath=following-sibling::dd').textContent())!;

  const admin = await browser.newContext({ storageState: STATE_FILE.admin });
  try {
    for (const step of [
      () => admin.request.post(`/api/admin/orders/${orderNo}/status`, { data: { to: 'PREPARING' } }),
      () => admin.request.post(`/api/admin/orders/${orderNo}/shipment`, { data: { carrier: 'CJ', trackingNumber: '123456789012' } }),
      () => admin.request.post(`/api/admin/orders/${orderNo}/status`, { data: { to: 'DELIVERED' } }),
    ]) {
      const res = await step();
      expect(res.ok(), `운영 처리가 막혔다 (${res.status()}) ${await res.text()}`).toBe(true);
    }

    // ── 손님: 교환을 고르고 다른 옵션으로
    await page.goto(`/order/${orderNo}`);
    await ready(page);
    await page.getByRole('button', { name: '반품 · 교환 신청' }).click();
    await page.getByRole('radio', { name: '교환' }).check();
    const exchangeTo = page.getByRole('group', { name: '바꿀 옵션' }).getByRole('combobox');
    await expect(exchangeTo).toHaveCount(1);
    const toVariant = await exchangeTo.inputValue();
    expect(toVariant, '처음에는 다른 옵션이 골라져 있어야 한다').not.toBe(fromVariant);
    const toLabel = (await exchangeTo.locator(`option[value="${toVariant}"]`).textContent())!.trim();
    const fromStock = await stockOf(page, fromVariant!);
    const toStockBefore = await stockOf(page, toVariant);

    await page.getByRole('radio', { name: /불량/ }).check();
    await page.getByRole('button', { name: '신청하기' }).click();
    await expect(page.getByText('교환 진행 중')).toHaveCount(1, { timeout: 20_000 });
    expect(await stockOf(page, toVariant), '바꿀 옵션의 재고가 신청 순간 잡히지 않았다').toBe(toStockBefore - 1);

    // ── 운영: 교환 승인 → 환불 단추 없이 교환 상품 발송
    const ap = await admin.newPage();
    await ap.goto(`/admin/orders/${orderNo}`);
    await ready(ap);
    const section = ap.getByRole('region', { name: '교환 신청' });
    await expect(section.getByText(new RegExp(`→ ${toLabel.replace(/[/()]/g, '\\$&')}`))).toBeVisible();
    await section.getByRole('button', { name: '교환 승인' }).click();

    const ship = ap.getByRole('form', { name: '교환 상품 발송' });
    await expect(ship).toBeVisible({ timeout: 20_000 });
    await expect(section.getByRole('button', { name: /환불/ }), '교환에 환불 단추가 떴다').toHaveCount(0);
    await ship.getByLabel('택배사').selectOption('HANJIN');
    await ship.getByLabel(/교환 송장번호/).fill('5555-6666-7777');
    await ship.getByRole('button', { name: '회수 확인 · 교환 상품 발송' }).click();
    await expect(ship).toHaveCount(0, { timeout: 20_000 });
    await expect(section.getByText(/한진택배 5555-?6666-?7777/)).toBeVisible();

    // ── 손님: 바꾼 옵션, 교환 송장, 결제 금액 그대로, 돌아온 옵션 재고 복귀
    await page.goto(`/order/${orderNo}`);
    await ready(page);
    await expect(page.getByText('교환 진행 중')).toHaveCount(0);
    await expect(page.getByText(new RegExp(`${toLabel.replace(/[/()]/g, '\\$&')} · 1`))).toBeVisible();
    await expect(page.getByText(/5555-?6666-?7777/)).toBeVisible();
    await expect(page.getByRole('term').filter({ hasText: '결제 금액' }).locator('xpath=following-sibling::dd')).toHaveText(payable);
    await expect(page.getByRole('term').filter({ hasText: '돌려받은 금액' })).toHaveCount(0);
    expect(await stockOf(page, fromVariant!), '돌아온 옵션의 재고가 안 돌아왔다').toBe(fromStock + 1);
    expect(await stockOf(page, toVariant), '바꿀 옵션을 두 번 깎았다').toBe(toStockBefore - 1);

    // ── 손님 알림함: 교환 상품을 보냈다는 알림이 이 주문으로 이어진다(메일도 같은 때 나간다 — 단위 검사가 본다)
    await page.goto('/mypage/notifications');
    await ready(page);
    const notice = page.getByRole('list', { name: '알림' }).getByRole('link').filter({ hasText: `주문 ${orderNo} 의 교환 상품을 보냈습니다.` });
    await expect(notice).toHaveCount(1);
    await expect(notice).toHaveAttribute('href', `/order/${orderNo}`);
  } finally {
    await admin.close();
  }
});
