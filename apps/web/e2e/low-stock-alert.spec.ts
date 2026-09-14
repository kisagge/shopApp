import { test, expect } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import {
  STATE_FILE, RACE_PRODUCT, addProductToCart, defaultAddressId, ready,
} from './state';

/**
 * 재고가 기준 아래로 내려가면 가맹점이 알림함에서 안다.
 *
 * **대시보드에도 "재고 부족" 이 뜨지만 열어야 안다.** 품절은 곧바로 매출 손실이고
 * 재입고에는 며칠이 걸린다 — 알아채는 시점이 늦을수록 비는 날이 길다.
 *
 * 여기서 보는 것은 넷이다.
 *
 * 1. **넘는 순간 알림이 온다** — 6 에서 하나 사서 5 가 되면.
 * 2. **이미 아래면 또 오지 않는다** — 5 에서 하나 더 사도.
 * 3. **매장 알림함에는 안 뜬다** — 가맹점 계정도 매장에 로그인한다.
 * 4. **운영 알림함을 열면 읽음이 되고, 누르면 재고를 고치는 자리로 간다.**
 *
 * 매장 알림함이 운영 알림까지 읽음으로 만들던 결함은 여기가 아니라 단위 검사
 * (notification-box)가 지킨다 — 왜 여기서 못 잡는지는 3번 검사에 적었다.
 */

test.use({ storageState: STATE_FILE.lowStockBuyer });
test.describe.configure({ mode: 'serial' });

interface World {
  readonly admin: BrowserContext;
  readonly buyer: BrowserContext;
  readonly merchant: BrowserContext;
  readonly buyerPage: Page;
  readonly variantId: string;
  readonly productId: string;
  readonly productName: string;
  readonly addressId: string;
  readonly orders: string[];
}

async function open(browser: Browser): Promise<World> {
  const admin = await browser.newContext({ storageState: STATE_FILE.admin });
  const buyer = await browser.newContext({ storageState: STATE_FILE.lowStockBuyer });
  const merchant = await browser.newContext({ storageState: STATE_FILE.merchant });
  const buyerPage = await buyer.newPage();

  const variantId = await addProductToCart(buyerPage, RACE_PRODUCT.lowStock);
  expect(variantId, '담을 수 있는 옵션이 없다').not.toBeNull();

  const cart = (await (await buyerPage.request.get('/api/cart')).json()) as {
    items: { variantId: string; productName: string }[];
  };
  const productName = cart.items.find((i) => i.variantId === variantId)!.productName;

  const found = (await (
    await admin.request.get(`/api/admin/products/search?q=${encodeURIComponent(productName)}`)
  ).json()) as { products: { id: string; name: string }[] };
  const hits = found.products.filter((p) => p.name === productName);
  expect(hits, `운영 검색이 "${productName}" 를 하나로 못 찾았다`).toHaveLength(1);

  return {
    admin, buyer, merchant, buyerPage,
    variantId: variantId!,
    productId: hits[0]!.id,
    productName,
    addressId: await defaultAddressId(buyerPage),
    orders: [],
  };
}

async function setStock(w: World, stock: number): Promise<void> {
  const res = await w.admin.request.patch(`/api/admin/products/${w.productId}/stock`, {
    data: { variants: [{ variantId: w.variantId, stock }] },
  });
  expect(res.ok(), `재고를 ${stock} 으로 못 세웠다 (${res.status()})`).toBe(true);
}

async function buyOne(w: World): Promise<void> {
  const res = await w.buyerPage.request.post('/api/orders', {
    data: {
      lines: [{ variantId: w.variantId, quantity: 1 }],
      addressId: w.addressId,
      paymentMethod: 'CARD',
      agreedToTerms: true,
    },
  });
  expect(res.ok(), `주문을 못 만들었다 (${res.status()})`).toBe(true);
  w.orders.push(((await res.json()) as { orderNo: string }).orderNo);
}

/**
 * 운영 알림함에서 이 상품의 재고 알림이 몇 줄인지.
 *
 * **이 화면을 열면 읽음이 된다** — 알림함은 그러라고 있다. 그래서 "안 읽음" 을
 * 확인해야 하는 자리에서는 이것을 부르지 않고 사이드바 뱃지를 본다. 처음에 이것으로
 * 도착을 기다렸다가, 뒤에서 뱃지를 보려니 이미 제가 다 읽어 버린 뒤였다.
 */
async function consoleAlerts(w: World): Promise<number> {
  const page = await w.merchant.newPage();
  try {
    await page.goto('/admin/notifications');
    await ready(page);
    return await page.locator('#main li').filter({ hasText: w.productName }).count();
  } finally {
    await page.close();
  }
}

/** 사이드바 알림 메뉴가 안 읽은 수를 달고 있는가. **읽음으로 만들지 않는다.** */
async function hasUnreadBadge(w: World): Promise<boolean> {
  const page = await w.merchant.newPage();
  try {
    await page.goto('/admin');
    await ready(page);
    // 뱃지는 낭독기용 이름("안 읽은 알림 N건")을 달고 있다 — 그 이름으로 찾는다
    return (await page.getByRole('link', { name: /안 읽은 알림/ }).count()) > 0;
  } finally {
    await page.close();
  }
}

let w: World;
let before = 0;

test.beforeAll(async ({ browser }) => {
  w = await open(browser);
  // 알림함을 한 번 열어 둔다 — 앞선 실행의 것을 읽음으로 만들어 뱃지 0 에서 시작한다
  before = await consoleAlerts(w);
  // 기준(5) 바로 위에서 시작한다
  await setStock(w, 6);
});

test.afterAll(async () => {
  // 되돌린다. 남기면 주문이 재고를 물고 다음 실행이 기준 아래에서 시작한다
  for (const orderNo of w.orders) {
    await w.buyerPage.request
      .post(`/api/orders/${orderNo}/cancel`, {
        data: { reason: '검사가 만든 주문을 되돌립니다' },
        failOnStatusCode: false,
      })
      .catch(() => null);
  }
  await setStock(w, 20).catch(() => null);
  await Promise.all([w.admin.close(), w.buyer.close(), w.merchant.close()]);
});

test('기준을 넘어 내려가면 사이드바에 안 읽은 수가 뜬다', async () => {
  expect(await hasUnreadBadge(w), '시작부터 안 읽은 알림이 있다').toBe(false);

  await buyOne(w); // 6 → 5

  /*
   * 알림은 **응답 뒤에** 남는다(주문을 기다리게 할 이유가 없다). 곧바로 읽으면
   * 아직 없다 — 기다린다. 알림함을 열지 않고 뱃지로 본다.
   */
  await expect.poll(() => hasUnreadBadge(w), { timeout: 15_000 }).toBe(true);
});

test('매장 알림함에는 재고 알림이 뜨지 않는다', async () => {
  /*
   * 가맹점 계정도 매장에 로그인한다. 거기서 "재고 부족" 을 들을 이유가 없다.
   *
   * ── 이 검사가 증명하지 못하는 것 ──
   * **매장 알림함을 열어도 운영 알림이 읽음이 되지 않는다** 는 것은 여기서
   * 증명되지 않는다. 읽음 처리 창구를 새던 상태로 되돌려 돌려 봤는데 이 검사가
   * 그대로 통과했다 — 매장 알림함은 **손님 알림 중 안 읽은 것이 있을 때만** 그
   * 창구를 부르는데, 이 계정에는 손님 알림이 없어서 창구가 아예 안 불린다.
   * 그 자리는 창구를 직접 부르는 단위 검사(notification-box)가 지킨다.
   */
  const shop = await w.merchant.newPage();
  try {
    await shop.goto('/mypage/notifications');
    await ready(shop);
    await expect(shop.locator('#main').getByText(w.productName)).toHaveCount(0);
    // 읽음 처리가 화면이 뜬 뒤에 나가므로 그것이 끝날 시간을 준다
    await shop.waitForTimeout(1_500);
  } finally {
    await shop.close();
  }

  // 적어도 이 흐름에서는 뱃지가 남아 있어야 한다 — 다음 검사가 이 상태에서 시작한다
  expect(await hasUnreadBadge(w)).toBe(true);
});

test('운영 알림함에는 그 옵션과 남은 수가 적혀 있고, 열면 읽음이 된다', async () => {
  const page = await w.merchant.newPage();
  try {
    await page.goto('/admin/notifications');
    await ready(page);

    const row = page.locator('#main li').filter({ hasText: w.productName }).first();
    await expect(row).toContainText('5개');
    // 누르면 곧바로 재고를 고치는 자리로 간다
    await expect(row.getByRole('link')).toHaveAttribute('href', `/admin/products/${w.productId}`);

    await page.waitForTimeout(1_500);
  } finally {
    await page.close();
  }

  expect(await consoleAlerts(w)).toBe(before + 1);
  expect(await hasUnreadBadge(w), '운영 알림함을 열었는데 뱃지가 남았다').toBe(false);
});

test('이미 기준 아래면 또 오지 않는다', async () => {
  /*
   * **여기가 이 파일의 요점이다.** 5 → 4 에서 또 보내면 품절까지 주문마다 알림이
   * 쌓인다. 다섯 통째에는 아무도 안 읽고, 그러면 알림함 전체가 무시된다.
   */
  await buyOne(w); // 5 → 4

  // 응답 뒤에 남는 일이라, "안 왔다" 를 확인하려면 올 만한 시간을 준다
  await w.buyerPage.waitForTimeout(3_000);
  expect(await hasUnreadBadge(w), '이미 알린 옵션에 또 보냈다').toBe(false);
});
