/**
 * 역할별 세션 파일. .gitignore 의 test-results/ 아래에 둔다.
 *
 * **장바구니를 쥐는 명세는 저마다 자기 손님을 쓴다.** 서버 장바구니는
 * 계정에 하나뿐이고 저장이 통째로 바꾸는 방식이라, 한 계정을 나눠 쓰면
 * 한쪽이 비우는 순간 다른 쪽 것이 사라진다 — 그런데 이 명세들은 하나같이
 * "먼저 비우고 담는" 것으로 시작한다. 자세한 사연은 seed-fixtures 에 있다.
 */
export const STATE_FILE = {
  customer: 'test-results/.auth/customer.json',
  admin: 'test-results/.auth/admin.json',
  merchant: 'test-results/.auth/merchant.json',

  cartOrdering: 'test-results/.auth/cart-ordering.json',
  cartPayment: 'test-results/.auth/cart-payment.json',
  cartA11y: 'test-results/.auth/cart-a11y.json',
  cartBudget: 'test-results/.auth/cart-budget.json',
  cartLayout: 'test-results/.auth/cart-layout.json',
  cartLifecycle: 'test-results/.auth/cart-lifecycle.json',
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
    /*
     * **요청이 던져도 기다림을 이어 간다.**
     *
     * 이 고리는 "장바구니에 줄이 생길 때까지 기다린다" 는 뜻이다. 그런데
     * 예외를 안 잡아 두었더니 ECONNRESET 하나에 명세가 통째로 졌다 —
     * 실제로 CI 에서 두 번 그랬고, 다시 돌리면 통과했다. 서버가 잠깐 연결을
     * 끊은 것이지 장바구니가 잘못된 것이 아니다.
     *
     * 산발적으로 지는 검사는 **없는 검사보다 나쁘다.** 진짜 회귀를 봐도
     * "또 그거겠지" 하고 넘기게 된다.
     */
    try {
      const cart = await page.request.get('/api/cart');
      const body = (await cart.json()) as { items?: { variantId: string }[] };
      variantId = body.items?.[0]?.variantId;
    } catch {
      // 다음 회차에 다시 묻는다. 서른 번을 다 쓰고도 못 얻으면 null 이 나간다.
    }
    if (!variantId) await page.waitForTimeout(200);
  }
  return variantId ?? null;
}
