import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * 주소가 이름 변경에서 살아남는가.
 *
 * **화면만 봐서는 고장인지 알 수 없는 종류다.** slug 를 고치면 옛 주소가
 * 404 를 내는데, 그 404 는 정상적인 404 와 똑같이 생겼다. 공유된 링크와
 * 검색엔진 색인이 죽은 것을 아무도 모른다.
 *
 * 그래서 **실제로 이름을 바꾸고 옛 주소로 들어가 본다.** 끝나면 되돌린다 —
 * 진짜 DB 를 건드리는 검사라 흔적을 남기면 다음 실행이 다른 것을 본다.
 */

const ORIGINAL = 'oversized-wool-coat';
const RENAMED = 'oversized-wool-coat-e2e';

async function rename(request: APIRequestContext, id: string, slug: string): Promise<void> {
  const response = await request.patch(`/api/admin/products/${id}`, { data: { slug } });
  expect(response.ok(), await response.text()).toBe(true);
}

test('이름을 바꿔도 옛 주소가 새 주소로 넘어간다', async ({ page, request }) => {
  const found = await request.get('/api/admin/products/search?q=오버사이즈');
  expect(found.ok()).toBe(true);
  const { products } = (await found.json()) as { products: { id: string; name: string }[] };
  const id = products[0]?.id;
  expect(id, '검색 창구가 상품을 찾아야 이 검사가 성립한다').toBeTruthy();

  try {
    await rename(request, id!, RENAMED);

    const moved = await page.goto(`/product/${ORIGINAL}`);

    // 옛 주소로 들어가면 새 주소가 열린다
    expect(page.url()).toContain(`/product/${RENAMED}`);
    expect(moved?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  } finally {
    await rename(request, id!, ORIGINAL);
  }

  /*
   * 되돌린 뒤. 옛 이름이 다시 지금 주소이면서 기록에도 남아 있을 수 있는데,
   * 기록을 먼저 보면 **자기 자신으로 넘기는 고리**가 된다.
   */
  await page.goto(`/product/${ORIGINAL}`);
  expect(page.url()).toContain(`/product/${ORIGINAL}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('쓴 적 없는 주소는 그대로 404 다', async ({ page }) => {
  const response = await page.goto('/product/no-such-product-ever');
  expect(response?.status()).toBe(404);
});
