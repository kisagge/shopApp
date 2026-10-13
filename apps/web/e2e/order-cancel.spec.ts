import { test, expect } from '@playwright/test';
import { STATE_FILE, RACE_PRODUCT, addProductToCart, ready, stockOf, payWithCard } from './state';

/**
 * 주문 전체 취소 — **결제한 주문을 사람이 화면에서 무르는 길.**
 *
 * 이 길에 단독 명세가 없었다. 취소 창구는 여러 명세가 쓰지만 전부 뒷정리거나(page.request.post)
 * 다른 검사의 곁다리였다 — 일부 취소 뒤의 나머지 줄, 동시성 겨루기. **한 줄짜리 주문을 화면에서
 * 그냥 무르는 가장 흔한 길**은 아무도 안 밟았고, 그 길의 단추에는 단위 검사도 없었다.
 *
 * 금액 규칙과 장부는 단위 검사가 본다. 여기서 보는 것은 **사람이 밟는 길이 끝까지 이어지는가**다:
 * 묻고, 사유를 받고, 상태가 바뀌고, 낸 돈이 돌아오고, 뺐던 재고가 돌아오고, 그 뒤로는 같은
 * 단추를 다시 누를 수 없다.
 *
 * **자기 상품과 자기 손님을 쓴다.** 재고를 흔드므로 홈의 첫 상품을 쓰면 남의 명세가 품절을
 * 만난다(e2e-fixture-isolation).
 */

test.use({ storageState: STATE_FILE.orderCanceler });
test.describe.configure({ mode: 'serial' });

test('결제한 주문을 화면에서 무르면 돈과 재고가 돌아오고, 다시 무를 수 없다', async ({ page }) => {
  test.setTimeout(120_000);

  const variantId = await addProductToCart(page, RACE_PRODUCT.orderCancel);
  expect(variantId, '담을 수 있는 옵션이 없다').not.toBeNull();

  // 담기만으로는 재고가 안 줄어든다 — 주문이 하나를 물고, 취소가 그것을 돌려준다
  const stockBefore = await stockOf(page, variantId!);

  const orderNo = await payWithCard(page);
  await expect(page.getByText('결제완료').first()).toBeVisible();

  const payable = (await page.getByRole('term').filter({ hasText: '결제 금액' })
    .locator('xpath=following-sibling::dd').textContent())!;
  expect(payable, '결제 금액이 비어 있다').toMatch(/\d/);

  expect(await stockOf(page, variantId!), '주문했는데 재고가 그대로다').toBe(stockBefore - 1);

  // ── 한 번 더 묻는다. 첫 누름으로는 아무것도 일어나지 않아야 한다
  await page.getByRole('button', { name: '주문 취소' }).click();
  await expect(page.getByText('주문을 취소할까요?')).toBeVisible();
  await expect(page.getByText('결제완료').first()).toBeVisible();

  // 돌아가면 아무 일도 없다 — 되돌릴 수 없는 단추라 빠져나갈 길이 있어야 한다
  await page.getByRole('button', { name: '돌아가기' }).click();
  await expect(page.getByText('주문을 취소할까요?')).toBeHidden();
  expect(await stockOf(page, variantId!), '돌아갔는데 재고가 돌아왔다').toBe(stockBefore - 1);

  // ── 사유를 적고 무른다. 사유는 감사 로그에 남는 값이다
  await page.getByRole('button', { name: '주문 취소' }).click();
  const reason = page.getByLabel('취소 사유');
  await expect(reason, '미리 적어 둔 사유가 없다 — 빈 칸을 두면 아무도 안 적는다').toHaveValue('단순 변심');
  await reason.fill('색이 생각과 달라서');
  await page.getByRole('button', { name: '주문 취소' }).last().click();

  await expect(page.getByText('환불완료').first()).toBeVisible({ timeout: 20_000 });

  // 낸 돈이 그대로 돌아온다. 한 줄짜리라 결제 금액과 같아야 한다
  const refunded = page.getByRole('term').filter({ hasText: '돌려받은 금액' });
  await expect(refunded, '돌려받은 금액 줄이 없다').toBeVisible();
  await expect(refunded.locator('xpath=following-sibling::dd')).toHaveText(`-${payable}`);

  expect(await stockOf(page, variantId!), '취소했는데 재고가 안 돌아왔다').toBe(stockBefore);

  // ── 끝난 주문에는 그 단추가 없다. 두 번 무를 길을 화면이 먼저 닫는다
  await page.reload();
  await ready(page);
  await expect(page.getByRole('button', { name: '주문 취소' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '일부 상품만 취소' })).toHaveCount(0);

  /*
   * **화면이 닫아도 창구는 스스로 닫혀야 한다.** 주소는 알려져 있고, 단추가 없다는 것은
   * 아무것도 막지 못한다. 거절당해야 재고와 돈이 두 번 돌아가지 않는다.
   */
  const again = await page.request.post(`/api/orders/${encodeURIComponent(orderNo)}/cancel`, {
    data: { reason: '두 번째 취소' },
    failOnStatusCode: false,
  });
  expect(again.status(), await again.text()).toBe(409);
  expect(await stockOf(page, variantId!), '두 번째 취소가 재고를 또 돌려줬다').toBe(stockBefore);

  // 스스로 취소한 것은 알림함에 남지 않는다 — 방금 누른 사람에게는 소음이다(메일은 간다)
  await page.goto('/mypage/notifications');
  await ready(page);
  await expect(page.getByText(`주문 ${orderNo} 의 상품이 취소되었습니다.`)).toHaveCount(0);
});
