import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { STATE_FILE, addFirstProductToCart, defaultAddressId, ready } from './state';

/**
 * 주문이 쌓인 뒤에 자기 주문을 찾는 길.
 *
 * **한동안 길이 없었다.** 이 화면은 상태 탭 하나만 받고 스무 건만 보여 주는데
 * 넘길 길도 없어서, 스물한 번째 주문부터는 **주소로도 못 갔다.** "작년에 산
 * 그 코트" 를 찾으려면 화면을 떠나야 했다.
 *
 * 여기서 보는 것은 넷이다.
 *
 * 1. **주문번호로 찾는다** — 문의할 때 손에 쥐고 있는 값이다.
 * 2. **상품명으로 찾는다** — 사람이 실제로 기억하는 것은 이쪽이다.
 * 3. **기간으로 좁힌다** — 끝날을 포함해야 한다.
 * 4. **탭과 검색이 서로를 지우지 않는다** — 좁혀 놓고 검색했더니 탭이 풀리는
 *    것이 가장 흔한 실망이다.
 */

test.use({ storageState: STATE_FILE.orderSearch });
test.describe.configure({ mode: 'serial' });

interface Placed {
  readonly orderNo: string;
  readonly productName: string;
}

/** 찾을 주문 하나를 만든다 */
async function placeOne(page: Page): Promise<Placed> {
  const variantId = await addFirstProductToCart(page);
  expect(variantId, '담을 수 있는 상품이 없다 — 시드가 비었다').not.toBeNull();

  const cart = (await (await page.request.get('/api/cart')).json()) as {
    items: { variantId: string; productName: string }[];
  };
  const picked = cart.items.find((i) => i.variantId === variantId);
  expect(picked, '방금 담은 줄을 장바구니에서 못 찾았다').toBeDefined();

  const created = await page.request.post('/api/orders', {
    data: {
      lines: [{ variantId: variantId!, quantity: 1 }],
      addressId: await defaultAddressId(page),
      paymentMethod: 'CARD',
      agreedToTerms: true,
    },
  });
  expect(created.ok(), `주문을 못 만들었다 (${created.status()})`).toBe(true);

  const order = (await created.json()) as { orderNo: string };
  return { orderNo: order.orderNo, productName: picked!.productName };
}

/** 목록에 뜬 주문번호들 */
async function listed(page: Page): Promise<string[]> {
  const links = page.locator('#main a[href^="/order/"]');
  const hrefs = await links.evaluateAll((all) =>
    all.map((a) => (a as HTMLAnchorElement).getAttribute('href') ?? ''),
  );
  return hrefs.map((h) => decodeURIComponent(h.replace('/order/', '')));
}

async function search(page: Page, query: Record<string, string>): Promise<void> {
  const url = new URLSearchParams(query).toString();
  await page.goto(`/mypage/orders?${url}`);
  await ready(page);
}

let placed: Placed;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: STATE_FILE.orderSearch });
  const page = await context.newPage();
  placed = await placeOne(page);
  await context.close();
});

test.afterAll(async ({ browser }) => {
  // 되돌린다. 남기면 그 주문이 재고를 물고 다음 실행을 흐린다.
  const context = await browser.newContext({ storageState: STATE_FILE.orderSearch });
  await context.request.post(`/api/orders/${placed.orderNo}/cancel`, {
    data: { reason: '검사가 만든 주문을 되돌립니다' },
    failOnStatusCode: false,
  });
  await context.close();
});

test('주문번호로 찾는다', async ({ page }) => {
  await search(page, { q: placed.orderNo });
  expect(await listed(page), '번호로 찾았는데 그 주문이 없다').toContain(placed.orderNo);
});

test('상품명으로 찾는다 — 사람이 기억하는 것은 이쪽이다', async ({ page }) => {
  await search(page, { q: placed.productName });
  expect(await listed(page), '상품명으로 못 찾았다').toContain(placed.orderNo);
});

test('없는 것을 찾으면 빈손이라고 말한다', async ({ page }) => {
  /*
   * **"주문이 없습니다" 라고 하면 안 된다.** 주문은 있는데 조건에 안 맞는
   * 것이고, 그 둘은 읽는 사람에게 전혀 다른 뜻이다 — 앞엣것은 조건을
   * 지우면 되고 뒤엣것은 장바구니로 가야 한다.
   */
  await search(page, { q: '이런상품은없습니다' });
  expect(await listed(page)).toHaveLength(0);
  await expect(page.locator('#main')).toContainText('조건에 맞는 주문이 없습니다');
});

test('기간으로 좁히고, 끝날을 포함한다', async ({ page }) => {
  /*
   * **오늘까지라고 적었으면 오늘 주문이 나와야 한다.** 받은 값을 그대로
   * 상한으로 쓰면 그날 하루가 조용히 빠지는데, 아무도 알아채지 못한다.
   */
  const today = new Date();
  const kst = new Date(today.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

  await search(page, { from: kst, to: kst });
  expect(await listed(page), '오늘 만든 주문이 오늘 구간에 없다').toContain(placed.orderNo);

  // 지난 구간에는 없어야 한다 — 기간이 실제로 거르는지
  await search(page, { from: '2020-01-01', to: '2020-01-02' });
  expect(await listed(page), '기간 밖인데 나온다').not.toContain(placed.orderNo);
});

test('날짜가 뒤집혀도 화면은 뜬다', async ({ page }) => {
  /*
   * 주소를 손으로 고쳤거나 날짜를 잘못 적었을 뿐인데 오류 화면이 뜨면
   * 과한 반응이다. 기간을 빼고 보여 주고 그 사실을 말한다.
   */
  await search(page, { from: '2026-09-10', to: '2026-09-01' });

  // Next 의 경로 알림도 role="alert" 라 둘이 잡힌다 — 화면에 그려진 쪽을 본다
  await expect(page.getByRole('alert').first()).toContainText('시작일이 종료일보다 뒤입니다');
  expect(await listed(page), '기간을 무시했으면 주문은 보여야 한다').toContain(placed.orderNo);
});

test('탭을 눌러도 검색어를 들고 간다', async ({ page }) => {
  /*
   * **여기가 이 파일의 요점이다.** 좁혀 놓고 탭을 눌렀는데 조건이 풀리면,
   * 사용자는 자기가 무엇을 보고 있는지 알 수 없다 — 매대의 "더 보기" 가
   * 필터를 흘렸던 것과 같은 모양이다.
   */
  await search(page, { q: placed.productName });

  /*
   * **주소가 바뀌기를 기다린다.** `ready()` 는 이미 붙어 있는 헤더 조각을
   * 보므로 곧바로 지나가고, 그러면 이동 전 주소를 읽는다 — 실제로 그렇게
   * 져서 "탭을 눌렀더니 검색어가 사라졌다" 는 엉뚱한 말을 들었다.
   */
  await page.getByRole('link', { name: '입금대기', exact: true }).click();
  await page.waitForURL(/status=PENDING/);
  await ready(page);

  const url = new URL(page.url());
  expect(url.searchParams.get('q'), '탭을 눌렀더니 검색어가 사라졌다').toBe(placed.productName);
  expect(url.searchParams.get('status')).toBe('PENDING');

  // 그리고 두 조건이 함께 걸려 있어야 한다
  expect(await listed(page)).toContain(placed.orderNo);
});

test('조건 지우기는 탭을 남긴다', async ({ page }) => {
  await search(page, { status: 'PENDING', q: placed.productName, from: '2026-01-01' });

  await page.getByRole('link', { name: '조건 지우기' }).click();
  // 지우기는 q 가 빠지는 것이 곧 이동이다
  await page.waitForURL((url) => !url.searchParams.has('q'));
  await ready(page);

  const url = new URL(page.url());
  expect(url.searchParams.get('q'), '검색어가 안 지워졌다').toBeNull();
  expect(url.searchParams.get('from')).toBeNull();
  expect(url.searchParams.get('status'), '탭까지 지워졌다').toBe('PENDING');
});
