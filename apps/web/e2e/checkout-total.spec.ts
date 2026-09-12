import { test, expect } from '@playwright/test';
import { STATE_FILE, addFirstProductToCart, ready } from './state';

/**
 * 화면에 적힌 금액이 **더해 보면 맞고, 실제로 그 값이 청구된다.**
 *
 * 금액 계산은 `@shop/core` 의 단위 검사가 촘촘히 덮고 있다. 그런데 그건
 * **계산기만** 재는 것이고, 화면에 그 계산기의 답이 나오는지는 말해 주지
 * 않는다 — 그 사이에 견적 API 와 폼과 요약 줄이 있다.
 *
 * 여기서 보는 것은 둘이다.
 *
 * 1. **줄들이 서로 맞는가.** 상품 금액에서 할인들을 빼고 배송비를 더하면
 *    최종 금액이어야 한다. 어느 줄 하나가 다른 값을 보면 사람은 결제 직전에
 *    멈추고, 멈추지 않으면 더 나쁘다.
 * 2. **보인 값이 청구되는가.** 화면에 89,000원이라고 적혀 있었는데 90,000원이
 *    빠져나가면 그것은 고칠 수 있는 종류의 실수가 아니다.
 *
 * **어떤 조합이든 맞아야 한다.** 단위 검사는 정해 둔 입력으로 돌지만, 이
 * 검사는 그때 장바구니에 담긴 것이 무엇이든 화면에 뜬 줄만 보고 더한다.
 */

test.use({ storageState: STATE_FILE.cartTotal });
test.describe.configure({ mode: 'serial' });

type Page = import('@playwright/test').Page;

/** "−12,000원" · "무료" · "289,000원" → 숫자 */
function wonOf(text: string): number {
  if (/무료|free/i.test(text)) return 0;
  const digits = text.replace(/[^\d]/g, '');
  expect(digits, `금액을 못 읽었다: "${text}"`).not.toBe('');
  return Number(digits);
}

/** 요약의 한 줄을 읽는다. 없으면 null — 할인 줄은 있을 때만 그려진다. */
async function row(page: Page, label: string): Promise<number | null> {
  const dt = page.locator('dt', { hasText: new RegExp(`^${label}$`) });
  if ((await dt.count()) === 0) return null;
  const value = await dt.locator('xpath=following-sibling::dd[1]').first().innerText();
  return wonOf(value);
}

async function toCheckout(page: Page): Promise<void> {
  await addFirstProductToCart(page);
  await page.goto('/checkout');
  await ready(page);
  await expect(page.getByRole('heading', { name: '배송지' })).toBeVisible();
  // 견적이 와야 줄이 그려진다 — 오기 전에 읽으면 "계산 중" 만 본다
  await expect(page.getByRole('button', { name: /원 결제하기/ })).toBeVisible();
}

/** 지금 화면의 줄들이 최종 금액과 맞는지 */
async function expectRowsAddUp(page: Page): Promise<number> {
  const subtotal = await row(page, '상품 금액');
  expect(subtotal, '상품 금액 줄을 못 찾았다').not.toBeNull();

  const productDiscount = (await row(page, '상품 할인')) ?? 0;
  const couponDiscount = (await row(page, '쿠폰 할인')) ?? 0;
  const pointsUsed = (await row(page, '포인트 사용')) ?? 0;
  const shipping = (await row(page, '배송비')) ?? 0;

  const final = await row(page, '최종 결제 금액');
  expect(final, '최종 결제 금액 줄을 못 찾았다').not.toBeNull();

  expect(
    subtotal! - productDiscount - couponDiscount - pointsUsed + shipping,
    `줄이 서로 안 맞는다 — 상품 ${subtotal} − 할인 ${productDiscount} − 쿠폰 ${couponDiscount}` +
      ` − 포인트 ${pointsUsed} + 배송 ${shipping} ≠ ${final}`,
  ).toBe(final);

  return final!;
}

test('요약의 줄들이 최종 금액과 맞는다', async ({ page }) => {
  await toCheckout(page);
  const final = await expectRowsAddUp(page);

  // 0원짜리 장바구니를 더해 놓고 통과했다고 하면 안 된다
  expect(final, '결제할 금액이 0 이다 — 장바구니가 비었을 수 있다').toBeGreaterThan(0);
});

test('할인이 실제로 한 줄로 잡힌다', async ({ page }) => {
  /*
   * **줄이 하나도 없으면 위 검사는 덧셈을 안 한 것과 같다.** 시드 매대에는
   * 정가보다 싸게 파는 상품이 있으므로, 담은 것 중 하나는 상품 할인이 잡혀야
   * 한다. 안 잡히면 파생 칸(sellingPrice)이 비었다는 뜻이기도 하다.
   */
  await toCheckout(page);

  const subtotal = await row(page, '상품 금액');
  const final = await row(page, '최종 결제 금액');
  const discount = await row(page, '상품 할인');

  expect(subtotal).not.toBeNull();
  if (discount === null) {
    // 할인 없는 상품이 걸렸을 수도 있다. 그때는 정가 그대로여야 한다.
    const shipping = (await row(page, '배송비')) ?? 0;
    expect(final).toBe(subtotal! + shipping);
    return;
  }
  expect(discount).toBeGreaterThan(0);
  expect(discount, '할인이 상품 금액보다 크다').toBeLessThan(subtotal!);
});

test('포인트를 쓰면 그만큼 줄고, 줄들은 여전히 맞는다', async ({ page }) => {
  await toCheckout(page);

  const before = await expectRowsAddUp(page);

  const points = page.getByLabel('사용할 포인트');
  if ((await points.count()) === 0) {
    /*
     * 포인트가 없는 계정이면 칸 자체가 안 뜬다. 그때는 이 검사가 확인할
     * 것이 없다 — **조용히 통과하지 않고 건너뛴다고 말한다.**
     */
    test.skip(true, '이 계정에 쓸 포인트가 없다');
    return;
  }

  await points.fill('1000');
  // 견적이 다시 오기를 기다린다 — 바로 읽으면 옛 값을 본다
  await expect(page.locator('dt', { hasText: /^포인트 사용$/ })).toBeVisible();

  const after = await expectRowsAddUp(page);
  expect(before - after, '포인트를 쓴 만큼 안 줄었다').toBe(1000);
});

test('쿠폰을 받으면 줄이 하나 늘고, 합은 여전히 맞는다', async ({ page }) => {
  /*
   * **쿠폰 줄이 한 번도 안 그려지고 있었다.** 위 검사들은 "없으면 0" 으로
   * 세므로, 쿠폰을 가진 적 없는 계정에서는 그 줄을 확인한 적이 없다 —
   * 덧셈에 늘 0 만 넣고 통과한 셈이다.
   *
   * 받는 것부터 밟는다. 쿠폰을 받아 쓰는 길은 화면 검사가 없던 자리이기도 하다.
   */
  const claim = await page.request.post('/api/coupons/claim', {
    data: { code: 'WELCOME10000' },
  });
  // 두 번째 실행부터는 이미 받은 상태다 — 그것도 정상이다
  expect([200, 409], `쿠폰을 못 받았다 (${claim.status()})`).toContain(claim.status());

  await toCheckout(page);

  const coupon = await row(page, '쿠폰 할인');
  expect(coupon, '쿠폰을 받았는데 쿠폰 할인 줄이 없다').not.toBeNull();
  // 시드의 WELCOME10000 은 3만원 이상에 1만원 정액이다
  expect(coupon, '정액 쿠폰인데 다른 값이 빠졌다').toBe(10_000);

  await expectRowsAddUp(page);
});

test('화면에 보인 금액이 그대로 청구된다', async ({ page }) => {
  /*
   * **여기가 이 파일의 요점이다.** 위 검사들은 화면 안에서 앞뒤가 맞는지만
   * 본다. 화면이 일관되게 틀린 값을 보여 주고 다른 값을 청구해도 통과한다.
   */
  await toCheckout(page);
  const shown = await expectRowsAddUp(page);

  await page.getByRole('checkbox', { name: /약관에 동의/ }).click();
  await page.getByRole('radio', { name: '신용·체크카드' }).click();

  // 단추에 적힌 금액도 요약과 같아야 한다 — 누르기 직전에 보는 숫자다
  const label = await page.getByRole('button', { name: /원 결제하기/ }).innerText();
  expect(wonOf(label), '단추에 적힌 금액이 요약과 다르다').toBe(shown);

  await page.getByRole('button', { name: /원 결제하기/ }).click();
  await page.waitForURL(/\/order\//, { timeout: 30_000 });
  await ready(page);

  const orderNo = decodeURIComponent(/\/order\/([^/?#]+)/.exec(page.url())![1]!);
  // 주문 화면은 "결제 금액", 결제 화면은 "최종 결제 금액" 이다 — 같은 값의 다른 이름
  const charged = await row(page, '결제 금액');
  expect(charged, `주문 ${orderNo} 의 금액이 화면에 보인 것과 다르다`).toBe(shown);

  // 되돌린다. 못 되돌리면 다음 실행이 재고 없이 시작한다.
  const undo = await page.request.post(`/api/orders/${orderNo}/cancel`, {
    data: { reason: '검사가 만든 주문을 되돌립니다' },
  });
  expect(undo.ok(), `주문 ${orderNo} 을 되돌리지 못했다 (${undo.status()})`).toBe(true);

  /*
   * **취소하면 쿠폰이 되살아난다.** 취소는 주문 생성이 한 일을 역순으로 푸는
   * 것이고, 쓴 쿠폰을 돌려주는 것도 거기 들어 있다. 안 돌려주면 취소 한 번에
   * 쿠폰이 사라지는데, 화면은 아무 말도 하지 않는다 — 쓸 때가 되어서야 없는
   * 것을 안다.
   *
   * 이 검사가 앞의 쿠폰 검사를 **다음 실행까지 살려 두는** 장치이기도 하다.
   * 되살아나지 않으면 두 번째 실행부터 쿠폰 줄이 안 그려진다.
   */
  await toCheckout(page);
  expect(
    await row(page, '쿠폰 할인'),
    '주문을 취소했는데 쿠폰이 안 돌아왔다',
  ).toBe(10_000);
});
