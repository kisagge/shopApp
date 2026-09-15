import { test, expect } from '@playwright/test';
import { ready } from './state';

/**
 * 운영 상품 화면에서 상품을 보관하면 매대에서 빠지고, 보관함에서 되돌리면 돌아온다.
 *
 * 누가 되돌릴 수 있는지·무엇을 적는지는 단위 검사가 본다. 여기서 보는 것은 **사람이 받는 결과**다: 누르기 전에 무엇이
 * 멈추는지 듣고, 보관하면 보관함으로 가서 결과를 듣고, 손님 주소가 없는 상품이 되고, 되돌리면 같은 주소가 다시 열린다.
 *
 * **자기 상품을 만들어 쓴다.** 시드 상품을 보관하면 그 사이 그 상품을 담는 명세가 진다. 복제한 사본을 이름을 바꿔
 * 판매중으로 올려 쓰고, 끝나면 다시 보관해 둔다 — 매대에 사본이 쌓이지 않는다.
 */

const SOURCE_SLUG = 'nylon-coach-blouson';

test('보관하면 매대에서 빠지고 보관함에 모이며, 되돌리면 같은 주소가 다시 열린다', async ({ page, browser }) => {
  test.setTimeout(90_000);

  const guest = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const gp = await guest.newPage();
  let copyId: string | undefined;
  try {
    // ── 준비: 사본을 만들어 알아볼 이름으로 판매중에 올린다
    await gp.goto(`/product/${SOURCE_SLUG}`);
    await ready(gp);
    const sourceName = (await gp.getByRole('heading', { level: 1 }).textContent())!.trim();
    const found = (await (await page.request.get(`/api/admin/products/search?q=${encodeURIComponent(sourceName)}`)).json()) as {
      products: { id: string; name: string }[];
    };
    const sourceId = found.products.find((p) => p.name === sourceName)?.id;
    expect(sourceId, `운영 검색이 "${sourceName}" 을 못 찾았다`).toBeTruthy();

    const copy = await page.request.post(`/api/admin/products/${sourceId}/duplicate`);
    expect(copy.ok(), `복제가 막혔다 (${copy.status()})`).toBe(true);
    copyId = ((await copy.json()) as { id: string }).id;

    const name = `보관 검사 ${Date.now()}`;
    const listed = await page.request.patch(`/api/admin/products/${copyId}`, { data: { name, status: 'ACTIVE' } });
    expect(listed.ok(), `사본을 판매중으로 못 올렸다 (${listed.status()}) ${await listed.text()}`).toBe(true);
    const { slug } = (await listed.json()) as { slug: string };

    expect((await gp.goto(`/product/${slug}`))?.status(), '판매중으로 올린 사본이 안 열린다').toBe(200);

    // ── 보관: 누르기 전에 무엇이 멈추고 남는지 듣는다
    await page.goto(`/admin/products/${copyId}`);
    await ready(page);
    await page.getByRole('button', { name: '보관', exact: true }).click();
    const confirm = page.getByRole('group', { name: '상품 보관' }).getByRole('button', { name: '보관하기' });
    await expect(confirm).toBeFocused();
    await expect(confirm).toHaveAccessibleDescription(/매대·검색에서 빠지고.*되돌릴 수 있습니다/);
    await confirm.click();

    // 수정 화면이 사라지므로 보관함으로 가서 결과를 말한다
    await page.waitForURL(/\/admin\/products\?view=archived&archived=1/, { timeout: 20_000 });
    await ready(page);
    await expect(page.getByRole('status').filter({ hasText: '상품을 보관했습니다.' })).toBeVisible();
    await expect(page.getByRole('link', { name: '보관함', exact: false })).toHaveAttribute('aria-current', 'page');
    const row = page.getByRole('region', { name: '보관한 상품 목록' }).getByRole('row').filter({ hasText: name });
    await expect(row).toHaveCount(1);
    await expect(row.getByRole('cell').filter({ hasText: '운영진' })).toHaveCount(1);
    await expect(row.getByText('판매중')).toBeVisible();

    // 손님에게는 없는 상품이고, 운영 수정 화면도 없다
    expect((await gp.goto(`/product/${slug}`))?.status(), '보관한 상품이 매대에 남았다').toBe(404);
    expect((await page.request.get(`/admin/products/${copyId}`))?.status()).toBe(404);

    // ── 되돌리기: 한 번에, 결과는 목록 위에서
    await row.getByRole('button', { name: `${name} 되돌리기` }).click();
    await page.waitForURL(/restored=1/, { timeout: 20_000 });
    await expect(page.getByRole('status').filter({ hasText: '상품을 되돌렸습니다.' })).toBeVisible();
    await expect(row).toHaveCount(0, { timeout: 15_000 });

    // 보관 전 상태(판매중)로 돌아와 같은 주소가 다시 열린다
    expect((await gp.goto(`/product/${slug}`))?.status(), '되돌렸는데 매대에 안 돌아왔다').toBe(200);
  } finally {
    // 사본은 다시 보관해 둔다 — 매대에 검사용 상품이 남지 않게
    if (copyId) await page.request.patch(`/api/admin/products/${copyId}/archive`, { data: { action: 'ARCHIVE' } });
    await guest.close();
  }
});
