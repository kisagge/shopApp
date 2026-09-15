import { expect } from '@playwright/test';
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
  superAdmin: 'test-results/.auth/super-admin.json',
  merchant: 'test-results/.auth/merchant.json',

  cartOrdering: 'test-results/.auth/cart-ordering.json',
  cartPayment: 'test-results/.auth/cart-payment.json',
  cartA11y: 'test-results/.auth/cart-a11y.json',
  cartBudget: 'test-results/.auth/cart-budget.json',
  cartLayout: 'test-results/.auth/cart-layout.json',
  cartLifecycle: 'test-results/.auth/cart-lifecycle.json',
  cartDeposit: 'test-results/.auth/cart-deposit.json',
  cartTotal: 'test-results/.auth/cart-total.json',
  cartCallback: 'test-results/.auth/cart-callback.json',

  /** 마지막 한 개를 두고 겨루는 두 사람 — stock-race */
  raceBuyerA: 'test-results/.auth/race-a.json',
  raceBuyerB: 'test-results/.auth/race-b.json',
  /** 같은 쿠폰·포인트로 두 번 결제해 보는 사람 — double-spend */
  doubleSpender: 'test-results/.auth/double-spend.json',
  /** 주문 내역 검색 — order-search */
  orderSearch: 'test-results/.auth/order-search.json',
  /** 재고를 기준 너머로 내리는 손님 — low-stock-alert */
  lowStockBuyer: 'test-results/.auth/low-stock-buyer.json',
  /** 두 줄을 사서 한 줄만 취소한다 — partial-cancel */
  partialCanceler: 'test-results/.auth/partial-cancel.json',
  /** 두 줄을 받고 한 줄만 반품한다 — partial-return */
  partialReturner: 'test-results/.auth/partial-return.json',
  /** 가맹점이 반품을 처리한다 — merchant-return */
  merchantReturner: 'test-results/.auth/merchant-return.json',
  /** 찜·재입고 알림 화면 — wishlist-restock */
  wishlistRestock: 'test-results/.auth/wishlist-restock.json',
  /** 받은 상품을 다른 옵션으로 교환한다 — exchange */
  exchanger: 'test-results/.auth/exchange.json',
  /** 받은 주문을 스스로 구매확정한다 — purchase-confirm */
  purchaseConfirmer: 'test-results/.auth/purchase-confirm.json',
  /** 운영진이 적립금을 손으로 지급·차감하는 손님 — point-adjust-admin */
  pointAdjustTarget: 'test-results/.auth/point-adjust.json',
  /** 배송지를 넣고 고치고 지운다 — address-edit */
  addressEditor: 'test-results/.auth/address-edit.json',
} as const;

/**
 * 리뷰를 건드리는 명세는 **저마다 자기 상품을 쓴다.**
 *
 * 한 상품의 리뷰 목록은 하나뿐이다. 두 명세가 나눠 쓰면 한쪽이 리뷰를 쓰는
 * 순간 다른 쪽이 보던 "첫 번째 리뷰" 가 바뀐다 — 도움됐어요 검사가 실제로
 * 그렇게 졌다. 장바구니를 나눠 쓰다 산발로 지던 것과 같은 모양이다.
 *
 * 슬러그를 여기 모아 두는 이유는 **떨어져 있으면 겹친 줄 모르기** 때문이다.
 * 둘이 달라야 한다는 것은 e2e-fixture-isolation 이 지킨다.
 */
/**
 * 재고를 건드리는 명세는 **저마다 자기 상품을 쓴다.**
 *
 * `addFirstProductToCart` 는 홈의 첫 상품을 집는다. 그 길을 아홉 명세가 함께
 * 쓰고 있는데, 재고 경쟁 검사는 그 변형의 재고를 **1 로 내렸다가 되돌린다** —
 * 그 사이에 담으려던 다른 명세는 품절을 만난다. 실제로 한 판이 그렇게 졌다.
 * 리뷰를 나눠 쓰다 진 것, 장바구니를 나눠 쓰다 진 것과 같은 모양이다.
 *
 * 그래서 이 둘은 홈에서 고르지 않고 **자기 상품 주소로 곧장 간다.** 둘이
 * 달라야 한다는 것은 e2e-fixture-isolation 이 지킨다.
 */
export const RACE_PRODUCT = {
  /** 재고를 1 로 내렸다 되돌린다 — stock-race */
  stock: 'washed-denim-straight',
  /** 여섯을 한꺼번에 산다 — double-spend. 쿠폰 최소 금액을 한 개로 넘겨야 한다 */
  coupon: 'heavy-cotton-hoodie',
  /**
   * 재고를 기준 바로 위(6)로 세우고 사서 알림을 부른다 — low-stock-alert.
   * **스튜디오눈 상품이어야 한다** — 가맹점 계정(merchant)이 그 가맹점이다.
   */
  lowStock: 'long-goose-down',
  /** 두 사이즈를 한 줄씩 사서 하나를 취소한다 — partial-cancel. 옵션이 둘 이상 있어야 한다 */
  partialCancel: 'light-down-vest',
  /** 두 사이즈를 받아 하나를 반품한다 — partial-return */
  partialReturn: 'merino-turtleneck',
  /**
   * 두 사이즈를 받아 전부 반품한다 — merchant-return. **스튜디오눈 상품이고, 두 옵션 다 재고가 이미
   * 기준(5) 이하여야 한다** — 사면서 새로 기준을 넘기면 가맹점 알림이 생겨 low-stock-alert 를 흔든다.
   */
  merchantReturn: 'leather-sleeve-blouson',
  /**
   * 한 옵션의 재고를 0 으로 내렸다가 되돌려 재입고 알림을 부른다 — wishlist-restock. 가맹점 없는 브랜드 상품이라 재고를
   * 내려도 가맹점 재고 부족 알림이 생기지 않는다. 옵션이 여럿이라 한 옵션이 품절이어도 담는 명세는 다른 옵션을 고른다.
   */
  restock: 'nylon-coach-jacket',
  /**
   * 사서 받고 다른 옵션으로 교환한다 — exchange. 바꿀 옵션의 재고를 잡고 돌아온 옵션을 되돌리므로 자기 상품이어야 한다.
   * 옵션이 여럿이고 추가금이 없는(같은 값) 자사 브랜드 상품이다.
   */
  exchange: 'cotton-field-jacket',
  /** 사서 받고 구매확정한다 — purchase-confirm. 재고 하나를 물고 돌려주지 않으므로 옵션과 재고가 넉넉한 자사 브랜드 상품이다 */
  purchaseConfirm: 'canvas-low-sneakers',
} as const;

export const REVIEW_PRODUCT = {
  /** 리뷰를 읽고 누르기만 한다 — review-helpful */
  readOnly: 'oversized-wool-coat',
  /** 리뷰를 쓰고 지운다 — order-lifecycle. 가맹점(스튜디오눈) 상품이어야 한다. */
  written: 'short-padding-blouson',
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
 *
 * **운영 화면에는 그 헤더가 없다.** 매장의 머리와 발을 `/admin` 에서 떼면서
 * 이 신호도 함께 사라졌다 — 여기를 안 고쳤다면 운영 검사 열몇 개가 30초씩
 * 기다리다 죽었을 것이다. 그쪽 신호는 운영 메뉴다. 둘 중 먼저 오는 것을
 * 기다린다.
 */
export async function ready(page: import('@playwright/test').Page): Promise<void> {
  await page
    .locator(
      'header a[href="/login"], header a[href="/mypage"], [aria-label="관리자 메뉴"] a[href]',
    )
    .first()
    .waitFor({ state: 'attached' });
}

/**
 * 이 계정의 기본 배송지 id.
 *
 * **연결이 한 번 끊겼다고 명세가 지면 안 된다.** `ECONNRESET` 은 서버가 잠깐
 * 연결을 끊은 것이지 배송지가 잘못된 것이 아니다 — 장바구니 기다림이 같은
 * 이유로 예외를 삼키게 돼 있고, 실제로 여기서 한 번 졌다.
 *
 * **산발적으로 지는 검사는 없는 검사보다 나쁘다.** 진짜 회귀를 봐도 "또
 * 그거겠지" 하고 넘기게 된다. 그래서 몇 번 다시 물어보되, **끝내 못 받으면
 * 조용히 넘어가지 않고 진다** — 배송지가 정말 없는 것도 알아야 한다.
 */
export async function defaultAddressId(
  page: import('@playwright/test').Page,
): Promise<string> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const body = (await (await page.request.get('/api/addresses')).json()) as
        | { id: string; isDefault: boolean }[]
        | { addresses: { id: string; isDefault: boolean }[] };
      const rows = Array.isArray(body) ? body : body.addresses;
      const picked = rows.find((a) => a.isDefault) ?? rows[0];
      if (picked) return picked.id;

      throw new Error('시드가 이 계정에 배송지를 안 만들었다');
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(200);
    }
  }

  throw new Error(`배송지를 못 읽었다: ${String(lastError)}`);
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

  return await pickAndAdd(page);
}

/**
 * 정해 둔 상품을 담는다.
 *
 * 홈의 첫 상품을 집는 위 함수와 **고르는 자리만 다르다.** 재고를 건드리는
 * 명세는 남의 상품을 건드리면 안 되므로 자기 주소로 곧장 간다 —
 * `RACE_PRODUCT` 에 이유를 적었다.
 */
export async function addProductToCart(
  page: import('@playwright/test').Page,
  slug: string,
): Promise<string | null> {
  await page.request.put('/api/cart', { data: { lines: [] } });
  await page.goto(`/product/${slug}`);
  await ready(page);
  return await pickAndAdd(page);
}

/** 상품 화면에서 옵션을 고르고 담는다. 담지 못했으면 null 이다. */
async function pickAndAdd(page: import('@playwright/test').Page): Promise<string | null> {

  // 옵션 그룹이 여럿이면(색·사이즈) 그룹마다 하나씩 골라야 조합이 정해진다
  const groups = await page.locator('[role="radiogroup"]').count();
  for (let i = 0; i < groups; i += 1) {
    const pick = page
      .locator('[role="radiogroup"]')
      .nth(i)
      .locator('[role="radio"]:not([data-sold-out])')
      .first();
    if ((await pick.count()) > 0) await pick.click();
  }

  /*
   * **단추가 열릴 때까지 기다린다.**
   *
   * 담기 단추는 옵션이 다 골라지기 전까지 `aria-disabled` 다. 고른 직후에
   * 곧바로 물으면 아직 옛 상태를 본다 — 부하가 걸린 기계에서는 그 사이가
   * 눈에 띄게 벌어진다. 실제로 문지기 한 판이 "담을 수 있는 상품이 없다" 로
   * 졌는데, 같은 상품을 바로 다시 돌리면 통과했다.
   *
   * **기다려도 안 열리면 null 이다.** 재고가 정말 없는 경우를 기다림으로
   * 덮으면 안 되므로, 짧게 기다리고 포기한다 — 부르는 쪽이 건너뛸지 정한다.
   */
  const addToCart = page.getByRole('button', { name: '장바구니 담기' });
  try {
    await expect
      .poll(() => addToCart.getAttribute('aria-disabled'), { timeout: 5_000 })
      .not.toBe('true');
  } catch {
    // **왜 null 인지 남긴다.** 두 갈래가 같은 null 이라, 문지기 로그만으로는 어느 쪽인지 알 수 없었다
    const radios = await page.locator('[role="radio"]').evaluateAll((els) =>
      els.map((e) => `${e.getAttribute('aria-label') ?? e.textContent?.trim()}:${e.getAttribute('aria-checked')}/${e.hasAttribute('data-sold-out') ? 'sold-out' : 'in-stock'}`),
    );
    console.warn(`[pickAndAdd] 담기 단추가 안 열렸다 ${page.url()} radios=${radios.join(' ')}`);
    return null;
  }
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
  if (!variantId) console.warn(`[pickAndAdd] 담았는데 장바구니에 줄이 안 생겼다 ${page.url()}`);
  return variantId ?? null;
}

/**
 * 이 옵션의 지금 재고(견적 창구로 읽는다).
 *
 * 반품·취소 명세 셋이 같은 몇 줄을 따로 들고 있었고, 그중 하나가 **읽기 한 번의 ECONNRESET** 으로 졌다 — 서버가 잠깐
 * 연결을 끊은 것이지 재고가 틀린 것이 아니다. defaultAddressId 와 같은 판단으로 몇 번 다시 묻고, 끝내 못 읽으면 진다.
 */
export async function stockOf(page: import('@playwright/test').Page, variantId: string): Promise<number> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const res = await page.request.post('/api/cart/quote', { data: { lines: [{ variantId, quantity: 1 }] } });
      return ((await res.json()) as { lines: { stock: number }[] }).lines[0]!.stock;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(200);
    }
  }
  throw new Error(`재고를 못 읽었다: ${String(lastError)}`);
}
