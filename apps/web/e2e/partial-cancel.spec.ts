import { test, expect, type Page } from '@playwright/test';
import { STATE_FILE, RACE_PRODUCT, addProductToCart, ready, stockOf } from './state';
import { layoutProblems, WIDTHS } from './layout';

/**
 * 일부 상품 취소 — 두 줄을 사서 한 줄만 무른다.
 *
 * 금액 규칙은 core 가, 장부는 cancel-items 의 단위 검사가 본다. 여기서 보는 것은 **사람이 밟는
 * 길이 끝까지 이어지는가**다: 결제한 주문 화면에서 줄을 고르면 서버가 센 금액이 뜨고, 누르면 그
 * 줄이 취소됐다고 적히고 돌려받은 금액이 결제 정보에 남는다. 그리고 그 줄의 재고가 돌아온다.
 *
 * **자기 상품과 자기 손님을 쓴다.** 재고를 흔드므로 홈의 첫 상품을 쓰면 남의 명세가 품절을
 * 만난다(e2e-fixture-isolation). 끝나면 나머지 줄까지 취소해 재고를 되돌린다 — 그 길이 곧
 * "일부 취소 뒤 전액 취소" 이기도 하다.
 */

test.use({ storageState: STATE_FILE.partialCanceler });
test.describe.configure({ mode: 'serial' });

/** 두 번째 옵션을 골라 한 줄 더 담는다. 담긴 줄 수가 둘이 될 때까지 기다린다 */
async function addSecondLine(page: Page): Promise<void> {
  const groups = page.locator('[role="radiogroup"]');
  const last = groups.nth((await groups.count()) - 1);
  const choices = last.locator('[role="radio"]:not([data-sold-out])');
  expect(await choices.count(), '두 번째로 고를 옵션이 없다 — 시드의 재고를 본다').toBeGreaterThanOrEqual(2);
  await choices.nth(1).click();

  const add = page.getByRole('button', { name: '장바구니 담기' });
  await expect.poll(() => add.getAttribute('aria-disabled')).not.toBe('true');
  await add.click();

  await expect
    .poll(async () => {
      const res = await page.request.get('/api/cart', { failOnStatusCode: false });
      if (!res.ok()) return 0;
      return ((await res.json()) as { items?: unknown[] }).items?.length ?? 0;
    }, { timeout: 15_000 })
    .toBe(2);
}


test('두 줄 중 한 줄을 취소하면 그 줄만 무르고, 돌려받은 금액이 남는다', async ({ page }) => {
  test.setTimeout(120_000);

  const first = await addProductToCart(page, RACE_PRODUCT.partialCancel);
  expect(first, '담을 수 있는 옵션이 없다').not.toBeNull();
  await addSecondLine(page);

  const cart = (await (await page.request.get('/api/cart')).json()) as { items: { variantId: string }[] };
  const variants = cart.items.map((i) => i.variantId);
  expect(variants).toHaveLength(2);
  const stockSum = async () => (await stockOf(page, variants[0]!)) + (await stockOf(page, variants[1]!));
  // 담기만으로는 재고가 안 줄어든다. 주문이 한 개씩 둘을 물고, 일부 취소가 하나를 돌려준다
  const stockBefore = await stockSum();

  // ── 결제
  await page.goto('/checkout');
  await ready(page);
  await expect(page.getByRole('button', { name: /원 결제하기/ })).toBeVisible();
  await page.getByRole('checkbox', { name: /약관에 동의/ }).click();
  await page.getByRole('radio', { name: '신용·체크카드' }).click();
  await page.getByRole('button', { name: /원 결제하기/ }).click();
  await page.waitForURL(/\/order\//, { timeout: 30_000 });
  await expect(page.getByText('결제완료').first()).toBeVisible();
  const payable = (await page.getByRole('term').filter({ hasText: '결제 금액' })
    .locator('xpath=following-sibling::dd').textContent())!;

  // ── 한 줄 고르기
  await page.getByRole('button', { name: '일부 상품만 취소' }).click();
  const form = page.getByRole('form', { name: '취소할 상품' });
  await expect(form).toBeFocused();

  const boxes = form.getByRole('checkbox');
  await expect(boxes).toHaveCount(2);
  await boxes.first().check();

  // 서버가 센 금액이 뜬다. 판매가 그대로가 아닐 수 있다(배송비 차감)
  const refund = form.getByRole('region', { name: '돌려받을 금액' });
  await expect(refund.getByRole('definition').first()).toHaveText(/[\d,]+원/, { timeout: 15_000 });
  const shown = (await refund.getByRole('definition').first().textContent())!;

  await form.getByRole('button', { name: '고른 상품 취소' }).click();
  await expect(page.getByText('상품 1개를 취소했습니다.')).toBeVisible({ timeout: 20_000 });

  // ── 그 줄만 취소됐다고 적히고, 돌려받은 금액이 미리 본 금액과 같다
  await expect(page.getByText('취소됨')).toHaveCount(1);
  const refundedRow = page.getByRole('term').filter({ hasText: '돌려받은 금액' });
  await expect(refundedRow).toBeVisible();
  await expect(refundedRow.locator('xpath=following-sibling::dd')).toHaveText(`-${shown}`);

  // 주문은 결제완료에 머물고, 남은 한 줄로는 일부 취소가 더 열리지 않는다(남은 게 하나면 주문 취소다)
  await expect(page.getByText('결제완료').first()).toBeVisible();
  await expect(page.getByRole('button', { name: '일부 상품만 취소' })).toHaveCount(0);

  // 취소한 줄 하나의 재고만 돌아왔다 — 남은 줄은 여전히 주문이 물고 있다
  expect(await stockSum(), '일부 취소가 재고를 안 돌려줬거나 남은 줄까지 돌려줬다').toBe(stockBefore - 1);

  // ── 영수증: 주문 상세와 같은 숫자. 결제 금액은 그대로, 돌려받은 금액과 실제 낸 돈이 따로
  await page.getByRole('link', { name: '영수증 보기' }).click();
  await page.waitForURL(/\/receipt$/);
  await ready(page);
  const receipt = page.getByRole('article', { name: '주문 영수증' });
  const receiptValue = (label: string) =>
    receipt.getByRole('term').filter({ hasText: new RegExp(`^${label}$`) }).locator('xpath=following-sibling::dd');
  await expect(receipt.getByRole('table', { name: '주문 상품' }).getByRole('row', { name: /\(취소됨\)/ })).toHaveCount(1);
  await expect(receiptValue('결제 금액')).toHaveText(payable);
  await expect(receiptValue('돌려받은 금액')).toHaveText(`-${shown}`);
  const won = (text: string) => Number(text.replace(/[^\d]/g, ''));
  expect(won((await receiptValue('실제 결제 금액').textContent())!), '영수증의 실제 낸 돈이 결제 − 환불과 다르다')
    .toBe(won(payable) - won(shown));

  // 인쇄하면 가게 머리·발과 단추가 빠진다 — 종이에는 영수증만
  await expect(page.getByRole('banner')).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('banner')).toBeHidden();
  await expect(page.getByRole('button', { name: '인쇄하기' })).toBeHidden();
  await expect(receipt).toBeVisible();
  await page.emulateMedia({ media: 'screen' });

  // 영수증의 자리 — 표가 좁은 폭에서 본문을 밀어내지 않는다(layout-coverage 의 DYNAMIC 이 여기를 가리킨다)
  const viewport = page.viewportSize();
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    const problems = await layoutProblems(page);
    expect(problems, `영수증 ${width}px 에서 자리가 어긋났다.\n` + problems.map((p) => `  · ${p.kind}: ${p.detail}`).join('\n')).toEqual([]);
  }
  if (viewport) await page.setViewportSize(viewport);

  await page.getByRole('link', { name: '주문 상세로' }).click();
  await page.waitForURL(/\/order\/[^/]+$/);
  await ready(page);

  // ── 두 번째 검사이자 뒷정리: 남은 줄까지 취소하면 결제한 돈이 **정확히 한 번씩** 다 돌아온다
  await page.getByRole('button', { name: '주문 취소' }).click();
  await page.getByRole('button', { name: '주문 취소' }).last().click();
  await expect(page.getByText('환불완료').first()).toBeVisible({ timeout: 20_000 });

  // 일부 취소 몫 + 나머지 = 결제 금액. 전액 취소가 결제액을 통째로 또 돌려주면 여기서 넘친다
  await expect(refundedRow.locator('xpath=following-sibling::dd')).toHaveText(`-${payable}`);
  expect(await stockSum(), '전부 취소했는데 재고가 처음으로 안 돌아왔다').toBe(stockBefore);

  // 스스로 취소한 것은 알림함에 남지 않는다 — 방금 누른 사람에게 "취소되었습니다" 는 소음이다(메일은 간다)
  const orderNo = decodeURIComponent(/\/order\/([^/?#]+)/.exec(page.url())![1]!);
  await page.goto('/mypage/notifications');
  await ready(page);
  await expect(page.getByText(`주문 ${orderNo} 의 상품이 취소되었습니다.`)).toHaveCount(0);
});

/**
 * **일부 취소와 전액 취소가 동시에 들어와도 한 번씩만 돌려준다.**
 *
 * 일부 취소는 주문 상태를 바꾸지 않는다. 예전 전액 취소는 남은 줄을 잠그기 전에 읽고 "상태가 그대로면"
 * 만 보았으므로, 그사이 한 줄이 취소되면 그 줄의 재고와 포인트가 한 번 더 돌아갔다. 두 창구가 같은 주문
 * 잠금을 잡는지 본다. 어느 쪽이 먼저 끝나든 끝난 모습은 같아야 한다 — 재고는 처음대로, 돌려준 돈은
 * 결제 금액과 같다.
 */
test('일부 취소와 전액 취소가 동시에 들어와도 재고와 돈이 한 번씩만 돌아온다', async ({ page }) => {
  test.setTimeout(120_000);

  const first = await addProductToCart(page, RACE_PRODUCT.partialCancel);
  expect(first, '담을 수 있는 옵션이 없다').not.toBeNull();
  await addSecondLine(page);

  const cart = (await (await page.request.get('/api/cart')).json()) as { items: { variantId: string }[] };
  const variants = cart.items.map((i) => i.variantId);
  const stockSum = async () => (await stockOf(page, variants[0]!)) + (await stockOf(page, variants[1]!));
  const stockBefore = await stockSum();

  await page.goto('/checkout');
  await ready(page);
  await expect(page.getByRole('button', { name: /원 결제하기/ })).toBeVisible();
  await page.getByRole('checkbox', { name: /약관에 동의/ }).click();
  await page.getByRole('radio', { name: '신용·체크카드' }).click();
  await page.getByRole('button', { name: /원 결제하기/ }).click();
  await page.waitForURL(/\/order\//, { timeout: 30_000 });
  await expect(page.getByText('결제완료').first()).toBeVisible();
  const orderNo = decodeURIComponent(/\/order\/([^/?#]+)/.exec(page.url())![1]!);
  const payable = (await page.getByRole('term').filter({ hasText: '결제 금액' })
    .locator('xpath=following-sibling::dd').textContent())!;

  // 줄 번호는 화면에 없다 — 줄을 고르면 나가는 금액 미리보기 요청에서 읽는다
  await page.getByRole('button', { name: '일부 상품만 취소' }).click();
  const form = page.getByRole('form', { name: '취소할 상품' });
  const [previewRequest] = await Promise.all([
    page.waitForRequest((r) => r.url().endsWith(`/cancel-items`) && r.method() === 'POST'),
    form.getByRole('checkbox').first().check(),
  ]);
  const { itemIds } = previewRequest.postDataJSON() as { itemIds: string[] };
  expect(itemIds).toHaveLength(1);

  const base = `/api/orders/${encodeURIComponent(orderNo)}`;
  const [partial, full] = await Promise.all([
    page.request.post(`${base}/cancel-items`, { data: { itemIds, reason: '동시 취소' }, failOnStatusCode: false }),
    page.request.post(`${base}/cancel`, { data: { reason: '동시 취소' }, failOnStatusCode: false }),
  ]);
  // 전액 취소는 언제나 된다. 일부 취소는 먼저 끝났으면 되고, 늦었으면 "이미 취소된 주문" 으로 거절된다
  expect(full.status(), await full.text()).toBe(200);
  expect([200, 409], await partial.text()).toContain(partial.status());

  expect(await stockSum(), '재고가 처음과 다르다 — 취소된 줄이 두 번 돌아왔거나 안 돌아왔다').toBe(stockBefore);

  await page.reload();
  await ready(page);
  await expect(page.getByText('환불완료').first()).toBeVisible();
  const refundedRow = page.getByRole('term').filter({ hasText: '돌려받은 금액' });
  await expect(refundedRow.locator('xpath=following-sibling::dd'), '돌려준 돈이 결제 금액과 다르다')
    .toHaveText(`-${payable}`);
});
