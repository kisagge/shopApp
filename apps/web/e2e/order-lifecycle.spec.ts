import { test, expect } from '@playwright/test';
import { STATE_FILE, ready } from './state';

/**
 * 결제 뒤의 한 바퀴 — 배송준비 · 출고 · 배송완료 · 반품 · 환불.
 *
 * **이 구간은 화면 검사가 하나도 없었다.** 상태 기계가 가장 복잡하고 돈이
 * 오가는 자리인데, 주문을 옮기거나 송장을 붙이거나 반품을 처리하는 화면을
 * 밟는 검사가 없었다. 단위 검사는 전이 규칙을 보지만, 그건 화면이 그것을
 * 제대로 불러 주는지는 말해 주지 않는다.
 *
 * 실제로 그 구간에서 결함이 나왔다 — 송장이 상태를 안 보고 먼저 저장돼서,
 * 취소된 주문에도 붙고 고객 화면에 배송 조회가 떴다. 손으로 눌러 보다 찾았다.
 *
 * **자기 자료를 만들고 되돌린다.** 출고는 되돌릴 수 없는 전이라(배송중에서
 * 취소로 가는 길이 없다) 시드 주문을 쓰면 다음 실행이 쓸 것이 없어진다.
 * 그래서 주문을 새로 만들고, 끝나면 반품·환불로 닫는다 — 환불은 재고를
 * 되돌리므로 흔적이 남지 않는다.
 *
 * 역할이 셋이라 맥락을 나눠 쓴다. 손님은 자기 장바구니를 쥐므로 다른 검사와
 * 나눠 쓰지 않는 계정을 쓴다.
 */

test.use({ storageState: STATE_FILE.cartLifecycle });
test.describe.configure({ mode: 'serial' });

/**
 * **가맹점 상품이어야 한다.**
 *
 * 가맹점은 자기 상품이 든 주문만 본다. 아무 상품이나 담으면 출고 화면에
 * 그 주문이 아예 안 보이고, 검사는 이유 없이 기다리다 진다 — 처음에 그렇게
 * 졌다. e2e 의 가맹점 계정은 스튜디오눈이다(seed-fixtures).
 */
const MERCHANT_PRODUCT = '/product/oversized-wool-coat';

/** 결제까지 마친 주문 하나를 만든다 */
async function placePaidOrder(page: import('@playwright/test').Page): Promise<string> {
  await page.request.put('/api/cart', { data: { lines: [] } });
  await page.goto(MERCHANT_PRODUCT);
  await ready(page);

  // 옵션을 골라야 담기가 열린다. 재고가 있는 첫 조합을 고른다.
  const radios = page.getByRole('radio');
  const count = await radios.count();
  for (let i = 0; i < count; i++) {
    const r = radios.nth(i);
    if ((await r.getAttribute('aria-disabled')) !== 'true') await r.click();
  }
  const add = page.getByRole('button', { name: /장바구니 담기/ });
  await expect(add).toBeEnabled();
  await add.click();

  await page.goto('/checkout');
  await ready(page);
  await expect(page.getByRole('heading', { name: '배송지' })).toBeVisible();
  await expect(page.getByRole('button', { name: /원 결제하기/ })).toBeVisible();
  await page.getByRole('checkbox', { name: /약관에 동의/ }).click();
  await page.getByRole('radio', { name: '신용·체크카드' }).click();
  await page.getByRole('button', { name: /원 결제하기/ }).click();

  await page.waitForURL(/\/order\//, { timeout: 30_000 });
  const hit = /\/order\/([^/?#]+)/.exec(page.url());
  expect(hit, `주문 화면으로 가지 않았다: ${page.url()}`).not.toBeNull();
  await expect(page.getByText('결제완료').first()).toBeVisible();
  return decodeURIComponent(hit![1]!);
}

test('출고하고 반품·환불로 닫는다', async ({ page, browser }) => {
  /*
   * 한 검사가 역할 셋을 거치고 주문을 만들고 되돌린다 — 기본 30초로는 모자란다.
   * 쪼개면 앞 검사가 만든 주문에 뒤 검사가 기대게 되는데, 그건 이 저장소가
   * 이미 여러 번 데인 모양이다. 한 검사로 두고 시간을 준다.
   */
  test.setTimeout(150_000);

  const orderNo = await placePaidOrder(page);

  const admin = await browser.newContext({ storageState: STATE_FILE.admin });
  const merchant = await browser.newContext({ storageState: STATE_FILE.merchant });

  try {
    /*
     * 결제완료에서 배송중으로 바로 갈 수는 없다 — 배송준비를 거쳐야 한다.
     * 그 규칙을 검사가 알고 있어야 아래 출고가 무엇을 하는지 분명해진다.
     */
    const toPreparing = await admin.request.post(`/api/admin/orders/${orderNo}/status`, {
      data: { to: 'PREPARING' },
    });
    expect(toPreparing.ok(), `배송준비로 못 옮겼다 (${toPreparing.status()})`).toBe(true);

    // ── 여기가 이 검사의 요점이다: 가맹점이 자기 화면에서 송장을 붙인다
    const mp = await merchant.newPage();
    await mp.goto(`/admin/orders/${orderNo}`);
    await ready(mp);

    await mp.locator('#carrier').selectOption('CJ');
    await mp.getByLabel('송장번호').fill('1234-5678-9012');
    await mp.getByRole('button', { name: '송장 등록하고 배송 시작' }).click();

    // 송장만 저장되고 상태가 그대로면 단추 이름이 거짓말을 한 것이다
    await expect(mp.getByText('배송중').first()).toBeVisible({ timeout: 15_000 });

    /*
     * **손님에게도 보여야 한다.** 운송 조회는 송장이 있을 때만 그려지므로,
     * 여기까지 와야 "붙었고 보인다" 가 확인된다.
     */
    await page.goto(`/order/${orderNo}`);
    await ready(page);
    await expect(page.getByText('1234-5678-9012')).toBeVisible();

    // ── 뒷정리: 배송완료 → 반품 신청 → 승인 → 환불(재고 복원)
    const toDelivered = await admin.request.post(`/api/admin/orders/${orderNo}/status`, {
      data: { to: 'DELIVERED' },
    });
    expect(toDelivered.ok(), `배송완료로 못 옮겼다 (${toDelivered.status()})`).toBe(true);

    const asked = await page.request.post(`/api/orders/${orderNo}/return`, {
      data: { type: 'RETURN', reason: 'CHANGED_MIND', detail: '검사가 만든 주문을 되돌립니다' },
    });
    expect(asked.ok(), `반품 신청이 안 됐다 (${asked.status()})`).toBe(true);

    const resolved = await admin.request.post(`/api/admin/orders/${orderNo}/return`, {
      data: { action: 'APPROVE' },
    });
    expect(
      resolved.ok(),
      `반품 승인이 안 됐다 (${resolved.status()}) ${await resolved.text()}`,
    ).toBe(true);

    /*
     * **승인만으로는 반품완료가 아니다.** 승인은 "받아 주겠다" 이고, 물건이
     * 돌아와야 반품완료다. 처음에 이 단계를 빼고 바로 환불을 불렀다가
     * 반품접수에서 환불완료로 갈 수 없다는 것을 알았다 — 그때 500 이 나서
     * `refundOrder` 의 오류 매핑까지 함께 고쳤다.
     */
    const toReturned = await admin.request.post(`/api/admin/orders/${orderNo}/status`, {
      data: { to: 'RETURNED' },
    });
    const returnedBody = await toReturned.text();
    expect(toReturned.ok(), `반품완료로 못 옮겼다 (${toReturned.status()}) ${returnedBody}`).toBe(true);

    /*
     * **주문이 실제로 옮겨졌는지 본다.** 예전에는 200 을 주면서 주문을 안
     * 옮겼다 — 줄만 반품완료가 되고 주문은 반품접수에 남았다. 그러고는
     * "다른 가맹점 상품이 남아 대기 중" 이라고 답했는데, 가맹점이 하나뿐인
     * 주문이었다. 응답 코드만 보는 검사는 이것을 통과시킨다.
     */
    const returned = JSON.parse(returnedBody) as {
      orderStatus: string;
      waitingForOthers: boolean;
    };
    expect(returned.orderStatus, '주문이 반품완료로 안 갔다').toBe('RETURNED');
    expect(returned.waitingForOthers, '기다릴 상대가 없는데 기다린다고 했다').toBe(false);

    const refunded = await admin.request.post(`/api/admin/orders/${orderNo}/status`, {
      data: { to: 'REFUNDED', note: '검사가 만든 주문을 되돌립니다' },
    });
    expect(
      refunded.ok(),
      `환불이 안 됐다 (${refunded.status()}) ${await refunded.text()}`,
    ).toBe(true);

    // 되돌렸으면 재고도 돌아와 있어야 한다 — 안 그러면 다음 실행이 말라 간다
    await page.goto(`/order/${orderNo}`);
    await ready(page);
    await expect(page.getByText('환불완료').first()).toBeVisible();
  } finally {
    await admin.close();
    await merchant.close();
  }
});
