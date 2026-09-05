import { test, expect } from '@playwright/test';

/**
 * 같은 주문을 두 번 만들지 않는다.
 *
 * 결제 버튼은 **눌리는 것을 막지 않는다** — 못 누르는 버튼은 초점을 못 받아
 * 왜 못 누르는지 들리지 않기 때문이고, 그 판단은 옳다. 대신 두 번 눌렸을 때
 * 주문이 두 개 생기면 안 되고, 그건 화면이 아니라 서버가 지켜야 한다.
 *
 * 주문이 두 개 생기면 **재고도 두 번 깎인다.** 결제되지 않은 쪽은 그 재고를
 * 물고 남는다 — 실제로 닷새 된 주문 셋이 그러고 있었다.
 */

/**
 * 살 수 있는 variantId 하나를 얻는다.
 *
 * 화면을 거쳐야 알 수 있는 값이라 실제로 담아 보고 서버 장바구니에서 읽는다.
 * **먼저 비운다** — 서버 장바구니는 계정에 남으므로, 앞선 실행이 남긴 줄을
 * 그대로 읽으면 그때 고른 옵션이 지금은 품절일 수 있다.
 */
async function pickVariant(page: import('@playwright/test').Page): Promise<string> {
  await page.request.put('/api/cart', { data: { lines: [] } });

  await page.goto('/');
  const href = (await page.locator('#main a[href^="/product/"]').first().getAttribute('href'))!;
  await page.goto(href);

  // 옵션을 다 고르기 전에는 담기 버튼이 눌리지 않는다. 품절 조합은 건너뛴다.
  const add = page.getByRole('button', { name: '장바구니 담기' });
  for (const group of await page.getByRole('radiogroup').all()) {
    await group.locator('[role="radio"]:not([aria-disabled="true"])').first().click();
  }
  await expect(add, '고른 조합이 살 수 있어야 한다').toBeEnabled();
  await add.click();

  /*
   * 담기는 화면에서 먼저 일어나고 서버 저장은 그 뒤에 따라간다 — 곧바로
   * 물으면 아직 비어 있을 수 있다. 저장될 때까지 기다린다.
   */
  let variantId: string | undefined;
  await expect
    .poll(async () => {
      const cart = await page.request.get('/api/cart');
      const body = (await cart.json()) as { items: { variantId: string }[] };
      variantId = body.items[0]?.variantId;
      return body.items.length;
    })
    .toBeGreaterThan(0);

  return variantId!;
}

test('같은 열쇠로 두 번 보내도 주문은 하나다', async ({ page }) => {
  const variantId = await pickVariant(page);

  const addresses = await page.request.get('/api/addresses');
  const { addresses: list } = (await addresses.json()) as { addresses: { id: string }[] };
  const addressId = list[0]?.id;
  expect(addressId, '배송지가 하나는 있어야 한다').toBeTruthy();

  const body = {
    lines: [{ variantId, quantity: 1 }],
    addressId,
    paymentMethod: 'CARD' as const,
    agreedToTerms: true as const,
    idempotencyKey: `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  };

  const first = await page.request.post('/api/orders', { data: body });
  expect(first.status(), await first.text()).toBe(201);
  const created = (await first.json()) as { orderNo: string };

  // 응답을 못 받아 그대로 다시 보낸 상황이다
  const second = await page.request.post('/api/orders', { data: body });
  expect(second.ok()).toBe(true);
  const again = (await second.json()) as { orderNo: string };

  // 새 주문이 아니라 먼저 만들어진 주문을 그대로 받는다
  expect(again.orderNo).toBe(created.orderNo);

  // 주문 목록에도 하나만 있어야 한다
  await page.goto('/mypage/orders');
  await expect(page.getByText(created.orderNo)).toHaveCount(1);
});

test('열쇠가 다르면 다른 주문이다 — 정말 두 번 사는 사람을 막지 않는다', async ({ page }) => {
  const variantId = await pickVariant(page);

  const addresses = await page.request.get('/api/addresses');
  const { addresses: list } = (await addresses.json()) as { addresses: { id: string }[] };

  const base = {
    lines: [{ variantId, quantity: 1 }],
    addressId: list[0]!.id,
    paymentMethod: 'CARD' as const,
    agreedToTerms: true as const,
  };

  const a = await page.request.post('/api/orders', {
    data: { ...base, idempotencyKey: `e2e-a-${Date.now()}-${Math.random().toString(36).slice(2)}` },
  });
  const b = await page.request.post('/api/orders', {
    data: { ...base, idempotencyKey: `e2e-b-${Date.now()}-${Math.random().toString(36).slice(2)}` },
  });

  expect(a.status()).toBe(201);
  expect(b.status()).toBe(201);
  expect((await a.json()).orderNo).not.toBe((await b.json()).orderNo);
});
