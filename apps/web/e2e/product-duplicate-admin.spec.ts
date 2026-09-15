import { test, expect } from '@playwright/test';
import { ready } from './state';

/**
 * 운영 상품 화면에서 복제하면 옵션·가격·사진을 가진 임시저장 사본이 생기고 곧바로 그 화면으로 간다.
 *
 * 무엇을 가져오고 두고 오는지는 단위 검사가 본다. 여기서 보는 것은 **사람이 받는 결과**다: 사본 화면이 열리고, 이름에
 * "(사본)" 이, 상태가 임시저장, 옵션 수·사진 수는 원본과 같고 재고는 전부 0, 그리고 손님은 사본 주소로 들어갈 수 없다.
 *
 * 원본은 건드리지 않으므로 리뷰·재고를 쥔 다른 명세와 부딪히지 않는다. 사본은 남는다 — 임시저장이라 매대에는 안 뜬다
 * (보관은 product-archive-admin 이 따로 본다).
 */

const SOURCE = '/product/nylon-coach-blouson';

test('복제하면 임시저장 사본 화면으로 가고, 옵션·사진은 같고 재고는 0, 손님에게는 안 보인다', async ({ page, browser }) => {
  test.setTimeout(90_000);

  // 원본 이름은 손님 화면에서 읽는다 — 운영 검색은 이름으로 찾는다
  const guest = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const gp = await guest.newPage();
  try {
    await gp.goto(SOURCE);
    await ready(gp);
    const name = (await gp.getByRole('heading', { level: 1 }).textContent())!.trim();

    const found = (await (await page.request.get(`/api/admin/products/search?q=${encodeURIComponent(name)}`)).json()) as {
      products: { id: string; name: string }[];
    };
    const sourceId = found.products.find((p) => p.name === name)?.id;
    expect(sourceId, `운영 검색이 "${name}" 을 못 찾았다`).toBeTruthy();

    await page.goto(`/admin/products/${sourceId}`);
    await ready(page);
    const stock = page.getByRole('region', { name: '옵션별 재고' });
    const variantCount = await stock.getByRole('spinbutton').count();
    const imageCount = await page.getByRole('button', { name: /번째 이미지 삭제$/ }).count();
    expect(variantCount, '옵션이 없는 원본이면 복제를 볼 것이 없다').toBeGreaterThan(0);

    // ── 복제: 한 번 더 묻고, 사본 화면으로
    await page.getByRole('button', { name: '복제' }).click();
    await expect(page.getByRole('button', { name: '사본 만들기' })).toBeVisible();
    await page.getByRole('button', { name: '사본 만들기' }).click();
    await page.waitForURL((url) => url.pathname.startsWith('/admin/products/') && !url.pathname.endsWith(sourceId!), { timeout: 20_000 });
    await ready(page);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`${name} (사본)`);
    await expect(page.getByLabel('상태')).toHaveValue('DRAFT');
    const copyStock = page.getByRole('region', { name: '옵션별 재고' }).getByRole('spinbutton');
    await expect(copyStock).toHaveCount(variantCount);
    for (const input of await copyStock.all()) await expect(input).toHaveValue('0');
    await expect(page.getByRole('button', { name: /번째 이미지 삭제$/ })).toHaveCount(imageCount);

    // ── 손님: 사본 주소는 없는 상품이다(임시저장)
    const copySlug = await page.getByLabel(/^슬러그/).inputValue();
    expect(copySlug).toMatch(/^nylon-coach-blouson-copy(-\d+)?$/);
    const response = await gp.goto(`/product/${copySlug}`);
    expect(response?.status()).toBe(404);
  } finally {
    await guest.close();
  }
});
