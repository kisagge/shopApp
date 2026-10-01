import { test, expect, type Page } from '@playwright/test';
import { STATE_FILE, RACE_PRODUCT, addProductToCart, ready, stockOf, payWithCard, shipToDelivered } from './state';

/**
 * 가맹점이 자기 상품 반품을 처리한다 — 승인과 도착 확인은 가맹점이, 환불은 운영진이.
 *
 * 권한을 나눈 자리라 **각자 자기 화면에서** 밟는다: 가맹점 화면에는 승인·반려와 "물건 도착 확인"
 * 이 뜨고 환불 단추는 없다. 운영 화면에는 가맹점이 확인했다는 기록과 "환불" 이 뜬다. 가맹점이 자기
 * 반품에 스스로 돈을 돌려줄 수 있으면 권한을 나눈 뜻이 없다.
 *
 * 두 줄을 전부 돌려받으므로 끝나면 재고가 처음으로 돌아온다(주문째 환불 경로). 상품은 두 옵션 다
 * 재고가 이미 기준 이하인 스튜디오눈 상품이다 — 새로 기준을 넘기면 가맹점 알림이 생긴다.
 */

test.use({ storageState: STATE_FILE.merchantReturner });
test.describe.configure({ mode: 'serial' });

async function addSecondLine(page: Page): Promise<void> {
  const groups = page.locator('[role="radiogroup"]');
  const last = groups.nth((await groups.count()) - 1);
  const choices = last.locator('[role="radio"]:not([data-sold-out])');
  expect(await choices.count(), '두 번째로 고를 옵션이 없다 — 시드 재고를 본다').toBeGreaterThanOrEqual(2);
  await choices.nth(1).click();
  const add = page.getByRole('button', { name: '장바구니 담기' });
  await expect.poll(() => add.getAttribute('aria-disabled')).not.toBe('true');
  await add.click();
  await expect
    .poll(async () => {
      const res = await page.request.get('/api/cart', { failOnStatusCode: false });
      return res.ok() ? (((await res.json()) as { items?: unknown[] }).items?.length ?? 0) : 0;
    }, { timeout: 15_000 })
    .toBe(2);
}


test('가맹점이 승인하고 도착을 확인하면, 운영진이 그 기록을 보고 환불한다', async ({ page, browser }) => {
  test.setTimeout(150_000);

  expect(await addProductToCart(page, RACE_PRODUCT.merchantReturn), '담을 수 있는 옵션이 없다').not.toBeNull();
  await addSecondLine(page);
  const cart = (await (await page.request.get('/api/cart')).json()) as { items: { variantId: string }[] };
  const variants = cart.items.map((i) => i.variantId);
  const stockSum = async () => (await stockOf(page, variants[0]!)) + (await stockOf(page, variants[1]!));
  const stockBefore = await stockSum();

  const orderNo = await payWithCard(page);

  const admin = await browser.newContext({ storageState: STATE_FILE.admin });
  const merchant = await browser.newContext({ storageState: STATE_FILE.merchant });
  try {
    await shipToDelivered(admin, orderNo);

    // ── 손님: 받은 두 줄을 전부 반품 신청(불량 — 반송비는 판매자)
    await page.goto(`/order/${orderNo}`);
    await ready(page);
    await page.getByRole('button', { name: /반품|교환/ }).first().click();
    await page.getByRole('radio', { name: /불량/ }).check();
    await page.getByRole('button', { name: '신청하기' }).click();
    await expect(page.getByText('반품 진행 중')).toHaveCount(2, { timeout: 20_000 });

    // 대기열에서 이 신청을 찾는다 — 한 주문번호의 줄이 어떤 단계이고 누구 차례인지
    const queueRow = (p: Page) =>
      p.getByRole('region', { name: '반품·교환 신청 목록' }).getByRole('row').filter({ hasText: orderNo });

    // ── 가맹점: 대기열에서 승인 대기로, 내 차례로 보인다(자기 상품만 든 신청)
    const mp = await merchant.newPage();
    await mp.goto('/admin/returns');
    await ready(mp);
    await expect(queueRow(mp)).toContainText('승인 대기');
    await expect(queueRow(mp)).toContainText('내 차례');

    // ── 가맹점: 자기 화면에서 승인
    await mp.goto(`/admin/orders/${orderNo}`);
    await ready(mp);
    const returns = mp.getByRole('region', { name: /반품 신청|교환 신청/ });
    await expect(returns).toBeVisible();
    await returns.getByRole('button', { name: '반품 승인' }).click();

    // ── 가맹점: 도착 확인. 환불 단추는 가맹점에게 없다
    const receive = mp.getByRole('button', { name: '물건 도착 확인' });
    await expect(receive).toBeVisible({ timeout: 20_000 });

    /*
     * **반품지를 고치려는 사람에게 몇 사람이 걸려 있는지 보인다.** 손님은 지금 이 주소를 상자에 적는
     * 중이고, 주소를 바꾸면 이미 적어 둔 사람에게는 아무 말도 가지 않았다 — 물건은 옛 창고로 간다.
     * 고치지는 않는다(다른 명세가 시드 주소를 본다) — 경고가 서는 것까지 본다.
     */
    await mp.goto('/admin/merchants');
    await ready(mp);
    await mp.getByRole('row').filter({ has: mp.getByRole('link', { name: /반품지/ }) })
      .getByRole('link', { name: /반품지/ }).click();
    await mp.waitForURL(/\/admin\/merchants\/[^/]+\/return-address$/);
    await ready(mp);
    await expect(mp.getByText(/안내받은 반품 신청이 \d+건/)).toBeVisible();

    /*
     * **알림을 누르고 들어오면 주소 한 벌이 있을 뿐이다.** 상자에 적어 둔 것이 옛 것인지 이것이 새
     * 것인지 알 수 없어서, 알림은 "뭔가 바뀌었다" 까지만 전한다 — 상세주소만 고쳐 보고 손님 화면이
     * 그 자리를 짚는지 본다. 다른 명세가 시드 주소를 보므로 곧바로 되돌린다.
     */
    const detail = mp.getByLabel('상세주소');
    const seeded = (await detail.inputValue()) || '';
    await detail.fill('물류창고 2층 (검사)');
    await mp.getByRole('button', { name: /반품지 (수정|등록)/ }).click();
    await expect(mp.getByRole('status')).toHaveText(/반품지를 저장했습니다/, { timeout: 20_000 });

    await page.goto(`/order/${orderNo}`);
    await ready(page);
    await expect(page.getByRole('region', { name: '보내실 곳' })).toContainText('안내드린 뒤에 바뀐 주소입니다');

    await detail.fill(seeded);
    await mp.getByRole('button', { name: /반품지 (수정|등록)/ }).click();
    await expect(mp.getByRole('status')).toHaveText(/반품지를 저장했습니다/, { timeout: 20_000 });

    await mp.goto(`/admin/orders/${orderNo}`);
    await ready(mp);

    /*
     * ── 손님: 승인했으면 **어디로 보낼지**가 주문 화면에 뜬다. 주소 없이 "상품을 보내 주세요" 만 오면 손님은 받은
     * 상자의 출고지로 보내거나 고객센터에 묻는다. 물건을 받는 곳은 이 가맹점 창고다.
     *
     * 도착 확인 단추가 뜬 뒤에 본다 — 승인 요청이 끝나기 전에 열면 아직 접수 상태의 화면을 본다.
     */
    await page.goto(`/order/${orderNo}`);
    await ready(page);
    const returnTo = page.getByRole('region', { name: '보내실 곳' });
    await expect(returnTo).toBeVisible();
    await expect(returnTo).toContainText('스튜디오눈 반품담당');
    await expect(returnTo).toContainText('서울 성동구 성수이로');

    await expect(mp.getByRole('button', { name: /환불/ }), '가맹점이 스스로 돈을 돌려줄 수 있다').toHaveCount(0);
    await receive.click();
    /*
     * **끝났다는 말을 기다린다.** 누르는 순간 단추 이름이 "확인하는 중…" 으로 바뀌어, 이름으로 사라짐을 기다리면 요청이
     * 끝나기 전에 통과한다 — 운영 화면이 확인 전 상태를 열어 한 판이 졌다(요청 485ms, 운영 화면은 그 140ms 뒤 시작).
     *
     * 그 말은 **화면이** 한다. 확인이 기록되면 단추가 통째로 사라지므로 단추 곁에 두면 말도 함께 사라진다 —
     * 실제로 다시 그리는 것이 조금 빨랐던 한 판에서 이 줄이 졌고, 그때 누른 사람은 아무 말도 듣지 못했다.
     */
    await expect(mp.getByRole('status').filter({ hasText: '도착을 확인했습니다' })).toBeVisible({ timeout: 20_000 });
    await expect(mp, '방금 한 일을 주소에 실어 둔다 — 다시 그려도 남는다').toHaveURL(/done=received/);

    // ── 대기열: 이제 환불 대기 — 가맹점 차례가 아니고 운영진 차례다(서로 기다리지 않게)
    await mp.goto('/admin/returns?view=REFUND');
    await ready(mp);
    await expect(queueRow(mp)).toContainText('환불 대기');
    await expect(queueRow(mp), '가맹점에게 환불이 자기 차례로 보인다').not.toContainText('내 차례');

    // ── 운영진: 가맹점의 확인을 보고 환불
    const ap = await admin.newPage();
    await ap.goto('/admin/returns?view=REFUND');
    await ready(ap);
    await expect(queueRow(ap)).toContainText('내 차례');
    await queueRow(ap).getByRole('link', { name: orderNo }).click();
    await ap.waitForURL(new RegExp(`/admin/orders/${orderNo}$`));
    await ready(ap);
    await expect(ap.getByText('가맹점이 물건 도착을 확인했습니다')).toBeVisible();
    // 누가 승인하고 누가 받았는지가 기록 그대로 뜬다 — 운영진에게는 이름과 역할로
    const valueOf = (term: string) => ap.locator('dt', { hasText: new RegExp(`^${term}$`) }).locator('xpath=following-sibling::dd');
    await expect(valueOf('승인한 사람')).toContainText('· 가맹점 ·');
    await expect(valueOf('회수 확인')).toContainText(/· 가맹점$/);
    await ap.getByRole('button', { name: '환불', exact: true }).click();
    await expect(ap.getByRole('button', { name: '환불', exact: true })).toHaveCount(0, { timeout: 20_000 });

    // ── 손님: 환불완료, 재고는 처음으로
    await expect
      .poll(async () => {
        await page.goto(`/order/${orderNo}`);
        await ready(page);
        return await page.getByText('환불완료').count();
      }, { timeout: 20_000 })
      .toBeGreaterThan(0);
    expect(await stockSum(), '전부 돌려받았는데 재고가 처음으로 안 돌아왔다').toBe(stockBefore);
  } finally {
    await Promise.all([admin.close(), merchant.close()]);
  }
});
