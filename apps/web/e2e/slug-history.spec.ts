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

/**
 * **아무도 안 쳐다보는 상품을 고른다.**
 *
 * 처음에는 오버사이즈 울 블렌드 코트를 썼는데, 그 상품은 다른 명세 다섯
 * 곳이 주소로 직접 가리키고 있었다. 이 검사는 어드민 프로젝트에서 돌고
 * 그 다섯은 손님·게스트 프로젝트에서 도니, 이름을 바꿔 놓은 그 잠깐이
 * 다른 검사와 겹친다. 옛 주소가 새 주소로 넘어가긴 하지만, 남이 붙잡고
 * 있는 것을 굳이 흔들 이유가 없다 — 장바구니를 나눠 쓰다 진 것과 같은
 * 종류다.
 *
 * 스웨이드 트러커 블루종은 어느 명세도 이름으로 부르지 않는다.
 * apps/web/test/e2e-fixture-isolation.test.ts 가 그 사실을 계속 지킨다.
 */
const ORIGINAL = 'suede-trucker-blouson';
const RENAMED = 'suede-trucker-blouson-e2e';
/** 검색 창구가 이 낱말로 딱 하나를 찾는다 */
const SEARCH = '트러커';

async function rename(request: APIRequestContext, id: string, slug: string): Promise<void> {
  const response = await request.patch(`/api/admin/products/${id}`, { data: { slug } });
  expect(response.ok(), await response.text()).toBe(true);
}

test('이름을 바꿔도 옛 주소가 새 주소로 넘어간다', async ({ page, request }) => {
  const found = await request.get(`/api/admin/products/search?q=${encodeURIComponent(SEARCH)}`);
  expect(found.ok()).toBe(true);
  const { products } = (await found.json()) as {
    products: { id: string; slug: string }[];
  };

  // 검색이 엉뚱한 것을 집으면 남의 상품 이름을 바꾸게 된다. 슬러그로 확인한다.
  const target = products.find((p) => p.slug === ORIGINAL);
  expect(target, `검색 창구가 ${ORIGINAL} 을 찾아야 이 검사가 성립한다`).toBeTruthy();
  const id = target!.id;

  try {
    await rename(request, id, RENAMED);

    const moved = await page.goto(`/product/${ORIGINAL}`);

    // 옛 주소로 들어가면 새 주소가 열린다
    expect(page.url()).toContain(`/product/${RENAMED}`);
    expect(moved?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  } finally {
    await rename(request, id, ORIGINAL);
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
