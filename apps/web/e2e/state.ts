/** 역할별 세션 파일. .gitignore 의 test-results/ 아래에 둔다. */
export const STATE_FILE = {
  customer: 'test-results/.auth/customer.json',
  admin: 'test-results/.auth/admin.json',
  merchant: 'test-results/.auth/merchant.json',
} as const;

/**
 * 화면이 **눌릴 준비가 됐는지** 기다린다.
 *
 * 하이드레이션 도중에 떨어진 클릭은 삼켜진다 — 링크의 기본 동작은 React 가
 * 막고, 정작 클라이언트 이동은 아직 시작할 수 없는 그 짧은 사이다. 빠른
 * 기계에서는 거의 안 나지만 CI 처럼 느린 곳에서는 실제로 난다. CPU 를 12배
 * 늦춰서 재현했다.
 *
 * 신호는 헤더의 로그인 상태 조각이다 — 세션을 읽기 전에는 자리만 잡고 있다가,
 * 하이드레이션이 끝나고 나서야 로그인이나 마이페이지 링크로 바뀐다.
 */
export async function ready(page: import('@playwright/test').Page): Promise<void> {
  await page
    .locator('header a[href="/login"], header a[href="/mypage"]')
    .first()
    .waitFor({ state: 'attached' });
}

/**
 * 첫 상품을 장바구니에 담고 그 변형 id 를 돌려준다.
 *
 * 결제 화면은 담긴 것이 없으면 볼 것이 없다 — 빈 화면을 훑으면 정작 검사하려던
 * 폼(배송지·결제 수단·약관)을 한 번도 못 본다.
 *
 * **먼저 비운다.** 서버 장바구니는 계정에 남으므로, 앞선 실행이 남긴 줄을
 * 그대로 읽으면 그때 고른 옵션이 지금은 품절일 수 있다.
 *
 * **상품 이름을 박지 않는다.** 시드가 바뀌어도 깨지지 않아야 하고, 재고가 없는
 * 조합을 고르면 담기 버튼이 눌리지 않으므로 재고 있는 옵션만 고른다.
 *
 * 담지 못했으면 null 이다. 부르는 쪽이 건너뛸지 정한다.
 */
export async function addFirstProductToCart(
  page: import('@playwright/test').Page,
): Promise<string | null> {
  await page.request.put('/api/cart', { data: { lines: [] } });

  await page.goto('/');
  await ready(page);
  await page.locator('#main a[href^="/product/"]').first().click();
  await page.waitForURL(/\/product\//);
  await ready(page);

  // 옵션 그룹이 여럿이면(색·사이즈) 그룹마다 하나씩 골라야 조합이 정해진다
  const groups = await page.locator('[role="radiogroup"]').count();
  for (let i = 0; i < groups; i += 1) {
    const pick = page
      .locator('[role="radiogroup"]')
      .nth(i)
      .locator('[role="radio"]:not([aria-disabled="true"])')
      .first();
    if ((await pick.count()) > 0) await pick.click();
  }

  const addToCart = page.getByRole('button', { name: '장바구니 담기' });
  if ((await addToCart.getAttribute('aria-disabled')) === 'true') return null;
  await addToCart.click();

  /*
   * 담기는 화면에서 먼저 일어나고 서버 저장은 그 뒤에 따라간다 — 곧바로
   * 물으면 아직 비어 있다.
   */
  let variantId: string | undefined;
  for (let attempt = 0; attempt < 30 && !variantId; attempt += 1) {
    const cart = await page.request.get('/api/cart');
    const body = (await cart.json()) as { items?: { variantId: string }[] };
    variantId = body.items?.[0]?.variantId;
    if (!variantId) await page.waitForTimeout(200);
  }
  return variantId ?? null;
}
