import { test, expect } from '@playwright/test';
import { STATE_FILE, addFirstProductToCart, ready } from './state';

/**
 * 가상계좌에 돈이 들어왔을 때.
 *
 * **결제창을 닫는 순간 끝나지 않는 유일한 결제 수단이다.** 계좌번호만 받고
 * 나가서 며칠 뒤에 입금할 수 있고, 그 입금을 알려 주는 것이 웹훅이다. 그때까지
 * 주문은 입금대기다.
 *
 * 이 구간은 단위 검사(deposit.test.ts)로만 덮여 있었다. **그건 고정된 값으로
 * 도는 검사라 조회 필드를 잘못 적어도 통과한다** — 결제 확정 검사가 똑같은
 * 이유로 화면 검사를 얻었다.
 *
 * 그리고 여기에는 돈이 걸린 설계 판단이 하나 있다. 이 주소는 공개돼 있어서
 * **누구나 아무 내용이나 보낼 수 있다.** 본문의 status 를 믿으면 한 푼도 안
 * 내고 주문을 결제 완료로 만들 수 있다. 서버는 본문에서 paymentKey 하나만
 * 꺼내 "가서 확인해라" 는 지시로 쓰고, 상태와 금액은 PG 에 직접 묻는다.
 * **그 판단이 실제로 지켜지는지 여기서 밟는다.**
 */

test.use({ storageState: STATE_FILE.cartDeposit });
test.describe.configure({ mode: 'serial' });

/**
 * 가상계좌 주문 하나를 만든다.
 *
 * 모의 게이트웨이의 결제 열쇠는 주문번호에서 그대로 만들어진다
 * (`pay-order.ts` 의 `mock_va_${orderNo}`). 그래서 웹훅을 흉내 낼 때 쓸
 * 열쇠를 따로 캐낼 필요가 없다.
 */
async function placeVirtualAccountOrder(page: import('@playwright/test').Page): Promise<string> {
  await addFirstProductToCart(page);
  await page.goto('/checkout');
  await ready(page);
  await expect(page.getByRole('heading', { name: '배송지' })).toBeVisible();
  await expect(page.getByRole('button', { name: /원 결제하기/ })).toBeVisible();

  await page.getByRole('checkbox', { name: /약관에 동의/ }).click();
  await page.getByRole('radio', { name: '가상계좌' }).click();
  await page.getByRole('button', { name: /원 결제하기/ }).click();

  await page.waitForURL(/\/order\//, { timeout: 30_000 });
  const hit = /\/order\/([^/?#]+)/.exec(page.url());
  expect(hit, `주문 화면으로 가지 않았다: ${page.url()}`).not.toBeNull();

  await expect(page.getByText('입금대기').first()).toBeVisible();
  return decodeURIComponent(hit![1]!);
}

/** 되돌린다. 못 되돌리면 다음 실행이 재고 없이 시작한다. */
async function undo(page: import('@playwright/test').Page, orderNo: string): Promise<void> {
  const res = await page.request.post(`/api/orders/${orderNo}/cancel`, {
    data: { reason: '검사가 만든 주문을 되돌립니다' },
  });
  expect(res.ok(), `주문 ${orderNo} 을 되돌리지 못했다 (${res.status()})`).toBe(true);
}

test('입금이 들어오면 입금대기가 결제완료가 된다', async ({ page }) => {
  const orderNo = await placeVirtualAccountOrder(page);

  const res = await page.request.post('/api/webhooks/toss', {
    data: { eventType: 'PAYMENT_STATUS_CHANGED', data: { paymentKey: `mock_va_${orderNo}` } },
  });
  expect(res.ok()).toBe(true);
  expect(await res.json()).toMatchObject({ received: true, applied: true, orderNo });

  await page.goto(`/order/${orderNo}`);
  await ready(page);
  await expect(page.getByText('결제완료').first()).toBeVisible();

  await undo(page, orderNo);
});

test('본문이 결제됐다고 우겨도 믿지 않는다', async ({ page }) => {
  /*
   * **이 주소는 공개돼 있다.** 본문을 믿으면 돈을 한 푼도 내지 않고 주문을
   * 결제 완료로 만들 수 있다. 우리가 모르는 열쇠를 들고 와서 "DONE" 이라고
   * 적어도, 서버는 PG 에 물어보고 "그런 결제 없다" 는 답을 받는다.
   */
  const orderNo = await placeVirtualAccountOrder(page);

  const forged = await page.request.post('/api/webhooks/toss', {
    data: {
      eventType: 'PAYMENT_STATUS_CHANGED',
      data: {
        paymentKey: 'i-made-this-up',
        status: 'DONE',
        orderId: orderNo,
        totalAmount: 9_999_999,
      },
    },
  });

  // 토스가 재시도로 두들기지 않게 늘 200 을 준다 — 반영은 안 한다
  expect(forged.ok()).toBe(true);
  expect(await forged.json()).toMatchObject({ received: true, applied: false });

  await page.goto(`/order/${orderNo}`);
  await ready(page);
  await expect(page.getByText('입금대기').first()).toBeVisible();
  await expect(page.getByText('결제완료')).toHaveCount(0);

  await undo(page, orderNo);
});

test('같은 웹훅이 두 번 와도 한 번만 반영된다', async ({ page }) => {
  /*
   * 웹훅은 여러 번 온다 — 우리가 늦게 답하거나 토스가 재시도하면 그렇다.
   * 두 번 반영되면 적립도 메일도 두 번 나간다.
   */
  const orderNo = await placeVirtualAccountOrder(page);
  const body = { eventType: 'PAYMENT_STATUS_CHANGED', data: { paymentKey: `mock_va_${orderNo}` } };

  const first = await page.request.post('/api/webhooks/toss', { data: body });
  expect(await first.json()).toMatchObject({ applied: true });

  const second = await page.request.post('/api/webhooks/toss', { data: body });
  expect(second.ok()).toBe(true);
  expect(await second.json()).toMatchObject({ applied: false });

  await undo(page, orderNo);
});

test('읽을 수 없는 본문에도 재시도를 부르지 않는다', async ({ page }) => {
  /*
   * 4xx·5xx 를 주면 토스가 계속 다시 보낸다. 본문이 깨졌다면 몇 번을 다시
   * 받아도 결과가 같으므로, 받았다고만 답하고 이유를 적어 돌려준다.
   */
  const res = await page.request.post('/api/webhooks/toss', {
    headers: { 'content-type': 'application/json' },
    data: '이건 JSON 이 아니다',
  });
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ received: true });
});
