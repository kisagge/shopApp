import { test, expect } from '@playwright/test';
import { STATE_FILE, addFirstProductToCart, defaultAddressId, ready } from './state';

/**
 * 결제창이 돌아오는 자리(`/checkout/success`).
 *
 * **운영에서 진짜 돈이 지나는 길은 여기 하나뿐인데, 밟아 본 적이 없었다.**
 * 모의 게이트웨이로 도는 검사들은 `/api/orders/.../confirm` 을 직접 부른다 —
 * 결제창을 못 띄우니 그럴 수밖에 없다. 그런데 운영에서는 토스가 이 주소로
 * 사람을 돌려보내고, 이 화면이 **서버에서** 승인을 부른다. 승인 경로가 둘인데
 * 검사는 한쪽만 보고 있었다.
 *
 * 여기서는 주문을 API 로 만들어 **입금 전(PENDING)** 상태로 두고, 토스가 하는
 * 것처럼 이 주소로 들어간다. 모의 열쇠(`mock_<주문번호>`)를 쓰면 그 뒤는
 * 운영과 같은 코드를 탄다.
 *
 * **쿼리로 오는 값은 하나도 믿지 않는다** — 그것이 이 화면의 설계다.
 * 금액은 주문에 저장된 값과 대조만 하고, 주문 번호도 세션 사용자의 것인지
 * 확인한 뒤에만 쓴다. 그 판단이 실제로 지켜지는지 본다.
 */

test.use({ storageState: STATE_FILE.cartCallback });
test.describe.configure({ mode: 'serial' });

type Page = import('@playwright/test').Page;

interface Placed {
  readonly orderNo: string;
  readonly payable: number;
}

/**
 * 입금 전 주문 하나를 만든다.
 *
 * 화면의 결제 단추는 모의 모드에서 곧바로 승인까지 가 버린다 — 그러면 이
 * 검사가 볼 것이 없다. 결제창이 뜨기 **직전** 상태를 만들려고 주문 생성만
 * 부른다. 운영에서 토스 창이 떠 있는 동안의 주문이 꼭 이 상태다.
 */
async function placePending(page: Page): Promise<Placed> {
  await addFirstProductToCart(page);
  await page.goto('/checkout');
  await ready(page);
  await expect(page.getByRole('button', { name: /원 결제하기/ })).toBeVisible();

  /*
   * 주문은 담긴 줄과 배송지를 함께 보내야 만들어진다. 화면이 보내는 것과
   * 같은 모양을 그대로 만든다 — 장바구니와 배송지는 이미 서버에 있다.
   */
  const cart = (await (await page.request.get('/api/cart')).json()) as {
    items: { variantId: string; quantity: number }[];
  };
  expect(cart.items.length, '장바구니가 비었다').toBeGreaterThan(0);

  const addressId = await defaultAddressId(page);

  const created = await page.request.post('/api/orders', {
    data: {
      lines: cart.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
      addressId,
      paymentMethod: 'CARD',
      agreedToTerms: true,
    },
  });
  expect(created.ok(), `주문을 못 만들었다 (${created.status()}) ${await created.text()}`).toBe(true);

  const order = (await created.json()) as { orderNo: string; payable: number; status: string };
  expect(order.status, '갓 만든 주문은 입금 전이어야 한다').toBe('PENDING');
  return { orderNo: order.orderNo, payable: order.payable };
}

async function undo(page: Page, orderNo: string): Promise<void> {
  const res = await page.request.post(`/api/orders/${orderNo}/cancel`, {
    data: { reason: '검사가 만든 주문을 되돌립니다' },
  });
  expect(res.ok(), `주문 ${orderNo} 을 되돌리지 못했다 (${res.status()})`).toBe(true);
}

test('돌아오면 승인되고 주문 화면으로 간다', async ({ page }) => {
  const { orderNo, payable } = await placePending(page);

  await page.goto(
    `/checkout/success?paymentKey=mock_${orderNo}&orderId=${orderNo}&amount=${payable}`,
  );
  await page.waitForURL(/\/order\//);
  await ready(page);

  expect(page.url(), '승인했다고 알리지 않는다').toContain('payment=done');
  await expect(page.getByText('결제완료').first()).toBeVisible();

  await undo(page, orderNo);
});

test('쿼리에 적힌 금액을 믿지 않는다', async ({ page }) => {
  /*
   * **여기가 이 파일의 요점이다.** 주소는 사람이 고칠 수 있다. 적힌 금액을
   * 그대로 승인하면 289,000원짜리 주문을 1,000원에 가져갈 수 있다.
   * 저장된 금액과 대조하고, 다르면 승인하지 않는다.
   */
  const { orderNo } = await placePending(page);

  await page.goto(
    `/checkout/success?paymentKey=mock_${orderNo}&orderId=${orderNo}&amount=1000`,
  );
  await page.waitForURL(/\/order\/|\/checkout\/fail/);
  await ready(page);

  expect(page.url(), '금액이 달라도 승인했다').not.toContain('payment=done');
  await expect(page.getByText('결제완료')).toHaveCount(0);

  /*
   * **막는 것만으로는 부족하다.** 승인을 안 한 것까지는 맞는데, 이 자리는
   * 오류 번호만 찍힌 화면을 띄우고 있었다 — 승인 실패를 `ConfirmError` 로만
   * 받고 `PaymentError` 는 그대로 위로 던졌다. 돈이 나갔는지 안 나갔는지
   * 모르는 사람에게 보여 줄 화면이 아니다. 자기 주문으로 데려가서, 왜
   * 안 됐고 지금 무엇을 할 수 있는지 읽히는지 본다.
   */
  expect(page.url(), '자기 주문으로 데려가지 않는다').toContain(`/order/${orderNo}`);
  expect(decodeURIComponent(page.url()), '왜 안 됐는지 안 적어 준다').toContain(
    'reason=AMOUNT_MISMATCH',
  );
  // Next 의 경로 알림도 role="alert" 라 둘이 잡힌다 — 화면에 그려진 쪽을 본다
  await expect(page.getByRole('alert').first()).toContainText('결제 승인이 되지 않았습니다');
  await expect(
    page.getByRole('button', { name: '다시 결제하기' }),
    '다시 결제할 길이 없다',
  ).toBeVisible();

  await undo(page, orderNo);
});

test('반쪽짜리 콜백은 실패 화면으로 보낸다', async ({ page }) => {
  // 낡은 주소를 다시 열거나 손으로 지우고 들어오면 이렇게 된다
  await page.goto('/checkout/success?paymentKey=&orderId=&amount=');
  await page.waitForURL(/\/checkout\/fail/);
  expect(page.url()).toContain('INVALID_CALLBACK');
});

test('없는 주문 번호는 맨 404 로 두지 않는다', async ({ page }) => {
  /*
   * 없는 주문의 주문 화면으로 보내면 404 만 뜬다 — 결제가 어떻게 됐는지
   * 한 글자도 못 본다. 낡은 콜백을 다시 열거나 남의 번호로 들어온 경우라
   * 실제로 일어난다.
   */
  await page.goto('/checkout/success?paymentKey=mock_x&orderId=20200101-0000000&amount=1000');
  await page.waitForURL(/\/checkout\/fail/);
  expect(page.url()).toContain('ORDER_NOT_FOUND');
});

test('로그인하지 않았으면 로그인으로 보내고, 돌아올 곳을 기억한다', async ({ browser }) => {
  /*
   * 결제창에서 돌아왔는데 세션이 끊겼을 수 있다. 그때 로그인만 시키고 끝내면
   * 사람은 자기 결제가 어떻게 됐는지 모른 채 홈으로 떨어진다.
   */
  /*
   * **빈 저장소를 손으로 넘겨야 손님이 된다.** `newContext()` 를 그냥 부르면
   * 이 파일 맨 위의 `test.use({ storageState })` 를 그대로 물려받는다 —
   * 로그인한 채로 들어가서 "없는 주문" 길을 타고, 손님 길은 밟히지 않는다.
   */
  const guest = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  try {
    const page = await guest.newPage();
    await page.goto('/checkout/success?paymentKey=mock_x&orderId=20200101-0000000&amount=1000');
    await page.waitForURL(/\/login/);
    expect(decodeURIComponent(page.url()), '돌아올 곳을 안 들고 간다').toContain(
      '/order/20200101-0000000',
    );
  } finally {
    await guest.close();
  }
});
