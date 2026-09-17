import { test, expect, type APIRequestContext } from '@playwright/test';
import { STATE_FILE, addProductToCart, ready } from './state';

/**
 * 쿠폰 받기 — 운영이 공개한 쿠폰을 코드 없이 받는다.
 *
 * 규칙(공개한 것만·수량·상품 대상)은 단위 검사가 본다. 여기서 보는 것은 사람이 받는 결과다: 받기 화면과 상품 화면에 받기
 * 단추가 뜨고, 누르면 같은 자리가 "받음" 이 되고, 새로 고쳐도 받은 채이고, 쿠폰함에 들어온다. 운영이 내리면 목록에서 빠지고,
 * **공개하지 않은 쿠폰은 id 를 알아도 못 받는다.**
 *
 * 자기 손님(couponCollector)을 쓴다. 쿠폰은 매번 새로 만들고(최소 주문 금액을 터무니없게 — 다른 명세의 결제에 끼지 않게)
 * 끝나면 중지한다.
 */

test.use({ storageState: STATE_FILE.couponCollector });
// 결제 화면을 보려고 서버 장바구니를 채우고 비운다 — 같은 파일의 검사끼리도 부딪히지 않게(cart-isolation)
test.describe.configure({ mode: 'serial' });

const makeCoupon = async (admin: APIRequestContext, prefix: string, downloadable: boolean) => {
  const stamp = Date.now().toString(36).toUpperCase();
  const name = `받기검사 ${prefix} ${stamp}`;
  const res = await admin.post('/api/admin/coupons', {
    data: {
      code: `${prefix}${stamp}`.slice(0, 20),
      name, kind: 'AMOUNT', value: 1000, minimumOrder: 10_000_000, issueLimit: 50,
      startsAt: new Date(Date.now() - 60_000).toISOString(),
      endsAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      downloadable,
    },
  });
  expect(res.status(), await res.text()).toBe(201);
  return { id: ((await res.json()) as { coupon: { id: string } }).coupon.id, name };
};

test('공개한 쿠폰을 받기 화면에서 받으면 "받음" 으로 남고 쿠폰함에 들어온다 — 공개하지 않은 쿠폰은 id 로도 못 받는다', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const adminContext = await browser.newContext({ storageState: STATE_FILE.admin });
  const admin = adminContext.request;
  const created: string[] = [];
  try {
    const open = await makeCoupon(admin, 'DL', true);
    const secret = await makeCoupon(admin, 'HID', false);
    created.push(open.id, secret.id);

    // ── 상품 화면에도 뜬다(대상이 없는 쿠폰은 모든 상품에 쓰인다)
    await page.goto('/product/nylon-coach-blouson');
    await ready(page);
    await expect(page.getByRole('region', { name: '이 상품에 쓸 수 있는 쿠폰' }).getByText(open.name)).toBeVisible();

    // ── 받기 화면에서 받는다
    await page.goto('/coupons');
    await ready(page);
    await expect(page.getByText(secret.name), '공개하지 않은 쿠폰이 받기 목록에 올랐다').toHaveCount(0);
    const get = page.getByRole('button', { name: `${open.name} 쿠폰 받기` });
    await get.click();
    const got = page.getByRole('button', { name: `${open.name} 쿠폰 받음` });
    await expect(got).toBeFocused({ timeout: 15_000 });
    await expect(page.getByText(`${open.name}을(를) 받았습니다.`, { exact: false })).toBeAttached();

    // 새로 고쳐도 받은 채다
    await page.reload();
    await ready(page);
    await expect(page.getByRole('button', { name: `${open.name} 쿠폰 받음` })).toBeVisible();

    // 쿠폰함에 들어왔다
    await page.goto('/mypage/coupons');
    await ready(page);
    await expect(page.getByText(open.name)).toBeVisible();

    /*
     * ── 결제 화면에서 **왜 못 쓰는지** 말한다. 이 쿠폰은 최소 주문 금액이 터무니없어(1,000만 원) 늘 모자란다 —
     * "사용 불가" 한 마디 대신 얼마를 더 담으면 되는지가 잠긴 단추의 설명으로 붙는다. 담기만 하고 주문하지 않는다.
     */
    expect(await addProductToCart(page, 'nylon-coach-blouson'), '담을 수 있는 옵션이 없다').not.toBeNull();
    try {
      await page.goto('/checkout');
      await ready(page);
      const locked = page.getByRole('radio', { name: new RegExp(open.name) });
      await expect(locked).toBeDisabled({ timeout: 15_000 });
      await expect(locked).toHaveAccessibleDescription(/10,000,000원 이상부터 — [\d,]+원 더 담으면 쓸 수 있어요/);
    } finally {
      await page.request.put('/api/cart', { data: { lines: [] } });
    }

    // ── 공개하지 않은 쿠폰은 id 를 알아도 없는 쿠폰이다
    const sneak = await page.request.post(`/api/coupons/${secret.id}/download`);
    expect(sneak.status(), '공개하지 않은 쿠폰을 id 로 받아 갔다').toBe(404);

    // ── 운영이 내리면 목록에서 빠진다 — 이미 받은 사람의 쿠폰함에는 남는다
    const hide = await admin.patch(`/api/admin/coupons/${open.id}`, { data: { downloadable: false } });
    expect(hide.ok()).toBe(true);
    await page.goto('/coupons');
    await ready(page);
    await expect(page.getByText(open.name)).toHaveCount(0);
    await page.goto('/mypage/coupons');
    await ready(page);
    await expect(page.getByText(open.name)).toBeVisible();
  } finally {
    for (const id of created) await admin.patch(`/api/admin/coupons/${id}`, { data: { isActive: false } });
    await adminContext.close();
  }
});
