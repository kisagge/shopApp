import { test, expect, type Page } from '@playwright/test';
import { STATE_FILE, RACE_PRODUCT, addProductToCart, ready } from './state';

/**
 * 장바구니에서 옵션 바꾸기, 지난 주문 다시 담기.
 *
 * 둘 다 **길이 없던** 것이다. 품절 줄에서 할 수 있는 일은 지우기뿐이었고, 지난 주문을 다시 사려면 상품을
 * 하나씩 찾아 옵션을 다시 골라야 했다. 규칙(자리 지키기·합치기·재고만큼·줄 수 상한)은 단위 검사가 본다.
 * 여기서 보는 것은 사람이 밟는 길이다: 줄 안에서 바꾸고, 새로 고쳐도 남고, 주문 화면에서 누르면 담긴다.
 *
 * 자기 손님(reorderer)과 자기 상품(RACE_PRODUCT.reorder)을 쓴다.
 */

test.use({ storageState: STATE_FILE.reorderer });
test.describe.configure({ mode: 'serial' });

/** 브라우저에 저장된 장바구니의 옵션 id 들 — 화면 글자보다 정확하다 */
async function cartVariantIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('shop.cart');
    const parsed = raw ? (JSON.parse(raw) as { state?: { items?: { variantId: string }[] } }) : {};
    return (parsed.state?.items ?? []).map((i) => i.variantId);
  });
}

test('장바구니 줄의 옵션을 그 자리에서 바꾸고, 새로 고쳐도 바뀐 채로 남는다', async ({ page }) => {
  const before = await addProductToCart(page, RACE_PRODUCT.reorder);
  expect(before, '담을 수 있는 옵션이 없다').not.toBeNull();

  await page.goto('/cart');
  await ready(page);

  const toggle = page.getByRole('button', { name: /옵션 변경$/ });
  await expect(toggle).toHaveCount(1);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');

  // 지금 옵션이 아닌, 고를 수 있는 첫 옵션
  const select = page.getByLabel('바꿀 옵션');
  await expect(select).toBeVisible();
  const target = await select.locator('option:not([disabled])').evaluateAll((els, current) =>
    els.map((e) => ({ value: (e as HTMLOptionElement).value, label: e.textContent ?? '' }))
      .find((o) => o.value !== current), before);
  expect(target, '바꿀 다른 옵션이 없다').toBeTruthy();

  await select.selectOption(target!.value);
  await page.getByRole('button', { name: '바꾸기' }).click();

  // 줄이 새 옵션으로 다시 그려지고, 초점은 새 줄의 같은 단추에 있다
  await expect(page.getByText(target!.label, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /옵션 변경$/ })).toBeFocused();
  await expect(page.getByRole('status').filter({ hasText: '옵션을 바꿨습니다' })).toHaveCount(1);
  expect(await cartVariantIds(page)).toEqual([target!.value]);

  /*
   * 서버 장바구니에도 바뀐 줄이 남는다. **새로 고치기 전에 기다린다** — 저장은 몰아서(600ms) 나가고,
   * 새로 고침마다 도는 병합은 합집합이라 저장 전에 새로 고치면 옛 줄이 되살아난다. 줄을 지울 때도 같은
   * 모양이라 여기서 따로 다루지 않는다.
   */
  await expect.poll(async () => {
    const body = (await (await page.request.get('/api/cart')).json()) as { items?: { variantId: string }[] };
    return (body.items ?? []).map((l) => l.variantId);
  }, { timeout: 10_000 }).toEqual([target!.value]);

  await page.reload();
  await ready(page);
  await expect(page.getByText(target!.label, { exact: true })).toBeVisible();
  expect(await cartVariantIds(page)).toEqual([target!.value]);
});

test('지난 주문 화면에서 다시 담기를 누르면 그 옵션이 장바구니에 들어오고, 무엇을 담았는지 말한다', async ({ page }) => {
  test.setTimeout(90_000);

  const variant = await addProductToCart(page, RACE_PRODUCT.reorder);
  expect(variant, '담을 수 있는 옵션이 없다').not.toBeNull();

  // ── 산다
  await page.goto('/checkout');
  await ready(page);
  await expect(page.getByRole('button', { name: /원 결제하기/ })).toBeVisible();
  await page.getByRole('checkbox', { name: /약관에 동의/ }).click();
  await page.getByRole('radio', { name: '신용·체크카드' }).click();
  await page.getByRole('button', { name: /원 결제하기/ }).click();
  await page.waitForURL(/\/order\//, { timeout: 30_000 });
  await ready(page);

  // 결제하면 산 줄은 장바구니에서 빠진다 — 다시 담기가 채우는 것을 보려고 비어 있는지 먼저 본다
  await expect.poll(() => cartVariantIds(page)).not.toContain(variant);

  // ── 다시 담는다
  await page.getByRole('button', { name: '이 주문 다시 담기' }).click();
  await expect(page.getByRole('status').filter({ hasText: '개 상품을 장바구니에 담았습니다.' })).toBeVisible();
  expect(await cartVariantIds(page)).toContain(variant);

  // ── 장바구니로 간다
  await page.getByRole('link', { name: '장바구니 보기' }).click();
  await page.waitForURL(/\/cart$/);
  await ready(page);
  await expect(page.getByRole('button', { name: /옵션 변경$/ })).toHaveCount(1);
});
