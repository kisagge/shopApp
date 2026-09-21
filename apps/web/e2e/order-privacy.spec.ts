import { test, expect, type Page } from '@playwright/test';
import { addFirstProductToCart, defaultAddressId, ready, STATE_FILE } from './state';

/**
 * 남의 주문은 번호를 알아도 열리지 않는다.
 *
 * **주문번호는 추측할 수 있다** — `20260903-0000001` 처럼 날짜와 연번이다. 조회는 번호와 함께 "그 사람 것인가"
 * 를 묻고 있지만(`getOrderForUser`), 선 서버에서 그것을 확인한 적은 한 번도 없었다. `where` 에서 `userId` 한
 * 줄이 빠져도 화면은 멀쩡히 열리고 검사는 초록이며, 새는 것은 남의 배송지·전화번호·영수증·가상계좌번호다.
 *
 * 가맹점끼리(merchant), 후기 주인(review-edit)의 같은 문제는 진작 검사가 있는데 손님끼리만 비어 있었다.
 *
 * 주인 노릇을 할 계정은 따로 둔다 — 자기 장바구니를 비우고 채우므로(주문을 만들어야 한다) 남과 나눠 쓸 수 없다.
 */

test.use({ storageState: STATE_FILE.orderPrivacy });
test.describe.configure({ mode: 'serial' });

/** 남의 주문을 들여다볼 사람. 장바구니를 쥐지 않는 계정이라 다른 명세를 흔들지 않는다 */
const STRANGER = STATE_FILE.addressEditor;

/**
 * 주문 하나를 만든다.
 *
 * **시드 주문에 기대지 않는다.** 데모 계정의 주문은 리뷰 시드가 만드는데 문지기는 그것을 돌리지 않아, 거기서
 * 번호를 집으려던 첫 판은 빈 목록을 보고 30초를 기다리다 졌다. 자기 계정으로 만들면 어느 DB 에서도 선다.
 */
async function placeOne(page: Page): Promise<string> {
  const variantId = await addFirstProductToCart(page);
  expect(variantId, '담을 수 있는 상품이 없다 — 시드가 비었다').not.toBeNull();

  const created = await page.request.post('/api/orders', {
    data: {
      lines: [{ variantId: variantId!, quantity: 1 }],
      addressId: await defaultAddressId(page),
      paymentMethod: 'CARD',
      agreedToTerms: true,
    },
  });
  expect(created.ok(), `주문을 못 만들었다 (${created.status()})`).toBe(true);
  return ((await created.json()) as { orderNo: string }).orderNo;
}

test('남의 주문번호로는 주문도 영수증도 열리지 않는다', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const stranger = await browser.newContext({ storageState: STRANGER });
  try {
    // ── 주인: 자기 주문을 하나 만든다
    const orderNo = await placeOne(page);

    // 주인은 열린다 — 아래 404 가 "그 주문이 없어서" 가 아니라는 것을 먼저 못 박는다
    const ownerSees = await page.goto(`/order/${orderNo}`);
    expect(ownerSees?.status()).toBe(200);
    await ready(page);
    await expect(page.getByText(orderNo).first()).toBeVisible();

    // ── 남: 같은 번호가 없는 주문이 된다
    const sp = await stranger.newPage();
    for (const path of [`/order/${orderNo}`, `/order/${orderNo}/receipt`]) {
      const response = await sp.goto(path);
      expect(response?.status(), `${path} 가 남에게 열렸다`).toBe(404);
      await expect(sp.getByText(orderNo)).toHaveCount(0);
    }
  } finally {
    await stranger.close();
  }
});

test('로그인하지 않으면 주문 화면은 로그인으로 보낸다 — 있는지 없는지도 알려 주지 않는다', async ({ browser }) => {
  const guest = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  try {
    const gp = await guest.newPage();
    await gp.goto('/order/20260903-0000001');
    await gp.waitForURL(/\/login/);
    // 돌아올 곳을 들고 간다 — 로그인하면 그 자리로 온다(주인이면 열리고, 아니면 404)
    expect(gp.url()).toContain('next=');
  } finally {
    await guest.close();
  }
});
