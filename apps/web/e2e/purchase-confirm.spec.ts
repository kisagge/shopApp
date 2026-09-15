import { test, expect, type Page } from '@playwright/test';
import { STATE_FILE, RACE_PRODUCT, addProductToCart, ready } from './state';

/**
 * 받은 주문을 손님이 스스로 구매확정한다.
 *
 * 전에는 확정이 **배송완료 뒤 며칠이 지나야 저절로** 일어났다 — 받자마자 괜찮다고 느낀 손님도 적립금을 며칠 기다렸다.
 * 규칙(canConfirmPurchase)과 장부(confirm-purchase)는 단위 검사가 본다. 여기서 보는 것은 사람이 밟는 길이다:
 * - 누르기 전에 무엇을 잃는지(단순 변심 반품) 먼저 말하고, 한 번 더 눌러야 확정된다
 * - 확정하면 단추가 사라지고 들어온 적립금을 말한다 — 단추가 사라져도 알림은 남는다(주소에 싣는다)
 * - 적립금 잔액이 그만큼 늘고, 반품 신청에서 단순 변심이 빠진다
 *
 * 자기 손님(purchaseConfirmer)과 자기 상품(RACE_PRODUCT.purchaseConfirm)을 쓴다.
 */

test.use({ storageState: STATE_FILE.purchaseConfirmer });
test.describe.configure({ mode: 'serial' });

async function pointBalance(page: Page): Promise<number> {
  await page.goto('/mypage/points');
  await ready(page);
  const text = await page.getByText('사용 가능 포인트').locator('xpath=following-sibling::span').textContent();
  return Number(text!.replace(/[^\d]/g, ''));
}

test('받은 주문을 구매확정하면 적립금이 바로 들어오고 단순 변심 반품이 닫힌다', async ({ page, browser }) => {
  test.setTimeout(120_000);

  const variant = await addProductToCart(page, RACE_PRODUCT.purchaseConfirm);
  expect(variant, '담을 수 있는 옵션이 없다').not.toBeNull();

  // ── 결제
  await page.goto('/checkout');
  await ready(page);
  await expect(page.getByRole('button', { name: /원 결제하기/ })).toBeVisible();
  await page.getByRole('checkbox', { name: /약관에 동의/ }).click();
  await page.getByRole('radio', { name: '신용·체크카드' }).click();
  await page.getByRole('button', { name: /원 결제하기/ }).click();
  await page.waitForURL(/\/order\//, { timeout: 30_000 });
  const orderNo = decodeURIComponent(/\/order\/([^/?#]+)/.exec(page.url())![1]!);

  // 배송완료 전에는 확정할 수 없다 — 받지도 않은 물건을 "이대로 받겠다" 고 할 수 없다
  await expect(page.getByRole('button', { name: '구매확정' })).toHaveCount(0);

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
  } finally {
    await admin.close();
  }

  const before = await pointBalance(page);

  // ── 손님: 누르면 먼저 무엇이 바뀌는지 말한다
  await page.goto(`/order/${orderNo}`);
  await ready(page);
  await page.getByRole('button', { name: '구매확정' }).click();
  const confirmGroup = page.getByRole('group', { name: '구매확정' });
  await expect(confirmGroup).toBeVisible();
  const doIt = confirmGroup.getByRole('button', { name: '구매확정하기' });
  // 설명이 확정 단추에 묶여 있다 — 화면 낭독기가 단추에서 바로 듣는다
  await expect(doIt).toHaveAccessibleDescription(/단순 변심으로 반품할 수 없습니다/);
  const note = (await confirmGroup.textContent())!;
  const reward = Number(/적립금 ([\d,]+)P/.exec(note)![1]!.replace(/,/g, ''));
  expect(reward, '적립금이 0 이면 들어온 것을 볼 수 없다 — 상품 값을 본다').toBeGreaterThan(0);

  await doIt.click();

  // ── 확정: 주소에 결과가 실리고, 단추 대신 알림이 남는다
  await page.waitForURL(/[?&]confirmed=1/, { timeout: 20_000 });
  await ready(page);
  await expect(page.getByRole('status').filter({ hasText: '구매를 확정했습니다.' })).toContainText(
    `${reward.toLocaleString('ko-KR')}P`,
  );
  await expect(page.getByRole('button', { name: '구매확정' })).toHaveCount(0);
  await expect(page.getByText('현재 상태는 구매확정입니다.')).toBeVisible();

  // 확정하면 단순 변심 반품이 닫힌다 — 판매자 귀책은 남는다
  await page.getByRole('button', { name: '반품 · 교환 신청' }).click();
  await expect(page.getByRole('radio', { name: /단순 변심/ })).toHaveCount(0);
  await expect(page.getByRole('radio', { name: /불량/ })).toHaveCount(1);

  // ── 적립금이 확정 순간 그만큼 들어왔다
  expect(await pointBalance(page), '확정했는데 적립금이 안 들어왔거나 두 번 들어왔다').toBe(before + reward);
});
