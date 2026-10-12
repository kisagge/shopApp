import { test, expect, type Page } from '@playwright/test';
import { STATE_FILE, RACE_PRODUCT, addProductToCart, ready } from './state';

/**
 * 장바구니 줄 편집 — **고르기·수량·삭제.**
 *
 * e2e 가 닿지 않던 자리다. 담는 것과 옵션을 바꾸는 것은 보고 있었는데(shopping·cart-reorder),
 * 담은 뒤에 사람이 가장 많이 하는 일 셋은 아무도 안 밟았다. 옆 명세가 "줄을 지울 때도 같은
 * 모양이라 여기서 따로 다루지 않는다" 고 적어 둔 그 자리다.
 *
 * **돈이 걸린 자리다.** 수량은 합계를 바꾸고, 고르기는 **무엇을 결제할지**를 정한다 — 안 고른 줄이
 * 합계에 섞이면 주문 화면에서야 다른 숫자를 본다. 지우기는 되돌릴 수 없다.
 *
 * 규칙(수량 경계·합계·선택)은 단위 검사가 본다(cart-store·cart-view). 여기서 보는 것은 **브라우저와
 * 서버가 같은 것을 들고 있는가** 다 — 저장은 몰아서 나가고, 새로 고치면 병합이 돈다.
 *
 * 자기 손님(cartLines)을 쓴다 — 서버 장바구니는 계정에 하나뿐이고 저장은 통째로 바꾸는 방식이라,
 * 나눠 쓰면 한쪽이 비우는 순간 다른 쪽 장바구니가 사라진다.
 */

test.use({ storageState: STATE_FILE.cartLines });
test.describe.configure({ mode: 'serial' });

/** 브라우저에 저장된 장바구니 — 화면 글자보다 정확하다 */
async function stored(page: Page): Promise<{ variantId: string; quantity: number }[]> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('shop.cart');
    const parsed = raw ? (JSON.parse(raw) as { state?: { items?: { variantId: string; quantity: number }[] } }) : {};
    return (parsed.state?.items ?? []).map((i) => ({ variantId: i.variantId, quantity: i.quantity }));
  });
}

/** 서버가 들고 있는 장바구니 — 몰아서 저장하므로 들어올 때까지 본다 */
async function onServer(page: Page): Promise<{ variantId: string; quantity: number }[]> {
  const res = await page.request.get('/api/cart');
  const body = (await res.json()) as { items?: { variantId: string; quantity: number }[] };
  return body.items ?? [];
}

const openCart = async (page: Page) => {
  await page.goto('/cart');
  await ready(page);
};

test('수량을 바꾸면 합계가 따라오고, 새로 고쳐도 그 수량이다', async ({ page }) => {
  test.setTimeout(90_000);

  const variantId = await addProductToCart(page, RACE_PRODUCT.cartLines);
  test.skip(variantId === null, '담을 수 있는 옵션이 없다');
  await openCart(page);

  /*
   * 합계는 주문 요약의 **상품 금액**이다. 주문하기 단추의 수는 고른 **줄 수**라 수량을 올려도
   * 안 바뀐다 — 거기를 보고 "합계가 따라온다" 고 적으면 영영 안 지는 검사가 된다(한 번 그렇게 썼다).
   */
  const subtotal = () =>
    page.getByRole('region', { name: '결제 예정 금액' }).getByText('상품 금액').locator('..');
  const before = (await subtotal().textContent())!;

  await page.getByRole('button', { name: '수량 늘리기' }).click();

  // 수량은 글자로도 읽힌다 — 숫자만 바뀌면 낭독기는 아무 말도 하지 않는다
  await expect(page.getByLabel('수량 2개')).toBeVisible();
  // 합계는 서버 견적이라 조금 뒤에 온다
  await expect.poll(async () => (await subtotal().textContent()) !== before, { timeout: 10_000 }).toBe(true);
  expect(await stored(page)).toEqual([{ variantId, quantity: 2 }]);

  /*
   * **저장이 나간 뒤에 새로 고친다.** 저장은 몰아서(600ms) 나가고, 새로 고침마다 도는 병합은
   * 합집합이라 저장 전에 새로 고치면 옛 수량이 되살아난다.
   */
  await expect.poll(async () => (await onServer(page))[0]?.quantity, { timeout: 10_000 }).toBe(2);
  await page.reload();
  await ready(page);

  await expect(page.getByLabel('수량 2개')).toBeVisible();
});

test('수량을 1 아래로는 내리지 못한다 — 0개짜리 줄은 줄이 아니다', async ({ page }) => {
  test.setTimeout(60_000);

  await openCart(page);
  const down = page.getByRole('button', { name: '수량 줄이기' });

  await down.click();
  await expect(page.getByLabel('수량 1개')).toBeVisible();

  await down.click();
  await expect(page.getByLabel('수량 1개')).toBeVisible();
  expect((await stored(page))[0]?.quantity).toBe(1);
});

/**
 * **고르기가 곧 무엇을 결제할지다.** 안 고른 줄이 합계에 섞이면 주문 화면에서야 다른 숫자를 본다.
 */
test('고른 줄만 합계와 주문하기에 센다', async ({ page }) => {
  test.setTimeout(90_000);

  const first = await addProductToCart(page, RACE_PRODUCT.cartLines);
  test.skip(first === null, '담을 수 있는 옵션이 없다');
  await openCart(page);

  await expect(page.getByRole('button', { name: '주문하기 (1)' })).toBeVisible();

  // 전체선택을 끄면 아무것도 안 고른 것이다
  await page.getByRole('checkbox', { name: /전체선택/ }).click();

  /*
   * **"(0)" 이 아니라 까닭을 적는다.** 수가 0 인 단추는 "눌러도 되는데 0개를 산다" 로 읽힌다 —
   * 무엇이 막는지 글자로 말하고, 누르지 못하는 것은 aria-disabled 로 알린다(DOM 에서 빼면
   * 낭독기가 그 자리에 무엇이 있었는지도 모른다).
   */
  const nothing = page.getByRole('button', { name: '주문할 수 있는 상품이 없습니다' });
  await expect(nothing).toBeVisible();
  await expect(nothing).toHaveAttribute('aria-disabled', 'true');

  // 다시 켜면 돌아온다
  await page.getByRole('checkbox', { name: /전체선택/ }).click();
  await expect(page.getByRole('button', { name: '주문하기 (1)' })).toBeVisible();
});

/**
 * **지우면 되돌릴 수 없다.** 그래서 지운 뒤 초점이 어디로 가는지가 중요하다 — 사라진 단추에
 * 초점이 남으면 키보드 사용자는 문서 맨 위로 튕긴다.
 */
test('줄을 지우면 목록에서 빠지고, 서버에도 남지 않는다', async ({ page }) => {
  test.setTimeout(90_000);

  const variantId = await addProductToCart(page, RACE_PRODUCT.cartLines);
  test.skip(variantId === null, '담을 수 있는 옵션이 없다');
  await openCart(page);

  const remove = page.getByRole('button', { name: /장바구니에서 삭제$/ }).first();
  await remove.click();

  // 마지막 줄을 지웠으면 빈 장바구니가 선다
  await expect(page.getByText('장바구니가 비어 있습니다.')).toBeVisible();
  expect(await stored(page)).toEqual([]);

  /** 지운 뒤 초점이 사라진 단추에 남으면 키보드 사용자는 문서 맨 위로 튕긴다 */
  const focused = await page.evaluate(() => document.activeElement?.tagName ?? '');
  expect(focused, '지운 뒤 초점이 body 로 사라졌다').not.toBe('BODY');

  await expect.poll(async () => (await onServer(page)).length, { timeout: 10_000 }).toBe(0);
  await page.reload();
  await ready(page);

  // **병합이 되살리지 않는다.** 합집합이라 지운 줄이 돌아오면 손님은 지운 것을 또 지워야 한다
  await expect(page.getByText('장바구니가 비어 있습니다.')).toBeVisible();
});

test('고른 줄만 한 번에 지운다', async ({ page }) => {
  test.setTimeout(90_000);

  const variantId = await addProductToCart(page, RACE_PRODUCT.cartLines);
  test.skip(variantId === null, '담을 수 있는 옵션이 없다');
  await openCart(page);

  await page.getByRole('button', { name: '선택삭제' }).click();

  await expect(page.getByText('장바구니가 비어 있습니다.')).toBeVisible();
  await expect.poll(async () => (await onServer(page)).length, { timeout: 10_000 }).toBe(0);
});
