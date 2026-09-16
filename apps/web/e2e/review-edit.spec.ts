import { test, expect } from '@playwright/test';
import { STATE_FILE, RACE_PRODUCT, addProductToCart, ready } from './state';
import { layoutProblems, WIDTHS } from './layout';

/**
 * 쓴 리뷰를 고친다.
 *
 * **창구(PATCH)는 처음부터 있었는데 화면이 없었다.** 그래서 오타 하나를 고치려면 지우고 다시 쓰는 수밖에 없었고, 그러면
 * 도움돼요 표와 판매자 답글이 함께 사라진다.
 *
 * 여기서 보는 것은 한 바퀴다 — 쓴 글이 마이페이지에 모이고, 고치면 손님 화면의 글이 바뀌고, 고쳐졌다는 사실이 남는다.
 *
 * **자기 자료를 만들고 되돌린다.** 리뷰는 상품 행에 미리 세어 둔 평점을 흔들므로, 끝나면 지워서 원래 수로 돌려놓는다.
 */

test.use({ storageState: STATE_FILE.reviewEditor });
test.describe.configure({ mode: 'serial' });

const PRODUCT = `/product/${RACE_PRODUCT.reviewEdit}`;
const FIRST = '처음 쓴 후기입니다. 어깨선이 잘 떨어지고 기장도 알맞았습니다.';
const EDITED = '다시 읽어 보니 한 가지 빠뜨렸습니다. 소매가 생각보다 길어 한 번 접어 입습니다.';

test('쓴 리뷰를 고치면 손님 화면이 바뀌고, 고쳐졌다는 사실이 남는다', async ({ page, browser }) => {
  // 주문을 만들고 배송완료까지 옮긴 뒤 리뷰를 쓰고 고친다 — 기본 30초로는 모자라다
  test.setTimeout(150_000);

  const variant = await addProductToCart(page, RACE_PRODUCT.reviewEdit);
  expect(variant, '담을 수 있는 옵션이 없다').not.toBeNull();

  await page.goto('/checkout');
  await ready(page);
  await expect(page.getByRole('button', { name: /원 결제하기/ })).toBeVisible();
  await page.getByRole('checkbox', { name: /약관에 동의/ }).click();
  await page.getByRole('radio', { name: '신용·체크카드' }).click();
  await page.getByRole('button', { name: /원 결제하기/ }).click();
  await page.waitForURL(/\/order\//, { timeout: 30_000 });
  const orderNo = decodeURIComponent(/\/order\/([^/?#]+)/.exec(page.url())![1]!);

  const admin = await browser.newContext({ storageState: STATE_FILE.admin });
  try {
    // 배송완료로 바로 갈 수는 없다 — 배송준비와 출고를 거쳐야 한다
    for (const step of [
      () => admin.request.post(`/api/admin/orders/${orderNo}/status`, { data: { to: 'PREPARING' } }),
      () => admin.request.post(`/api/admin/orders/${orderNo}/shipment`, {
        data: { carrier: 'CJ', trackingNumber: '987654321098' },
      }),
      () => admin.request.post(`/api/admin/orders/${orderNo}/status`, { data: { to: 'DELIVERED' } }),
    ]) {
      const moved = await step();
      expect(moved.ok(), `운영 처리가 막혔다 (${moved.status()}) ${await moved.text()}`).toBe(true);
    }
  } finally {
    await admin.close();
  }

  // ── 쓴다
  await page.goto('/mypage/reviews');
  await ready(page);
  // 별 라디오는 sr-only 라 눈에 보이지 않는다 — 사람이 누르는 것은 별 모양이 있는 라벨이다
  await page.locator('label').filter({ hasText: '4점' }).first().click();
  await page.getByRole('textbox', { name: '후기' }).first().fill(FIRST);
  await page.getByRole('button', { name: '리뷰 등록' }).first().click();
  await expect(page.getByText('리뷰를 등록했습니다')).toBeVisible();

  const written = page.getByRole('region', { name: /내가 쓴 리뷰/ });
  // 쓴 글은 그 상품 화면까지 들어가지 않아도 여기 모인다
  await expect(written.getByText(FIRST)).toBeVisible();

  try {
    // ── 고치는 화면. 자리가 무너지지 않는지 네 폭으로 잰다
    await written.getByRole('link', { name: '수정' }).first().click();
    await page.waitForURL(/\/mypage\/reviews\/[^/]+\/edit$/);
    await ready(page);

    const editUrl = page.url();
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(editUrl, { waitUntil: 'domcontentloaded' });
      const problems = await layoutProblems(page);
      expect(
        problems,
        `리뷰 수정 ${width}px 에서 자리가 어긋났다.\n` +
          problems.map((p) => `  · ${p.kind}: ${p.detail}`).join('\n'),
      ).toEqual([]);
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(editUrl);
    await ready(page);

    // **쓴 그대로 채워져 있어야 한다.** 빈 폼을 주면 한 글자를 고치려던 사람이 글 전체를 잃는다
    const body = page.getByRole('textbox', { name: '후기' });
    await expect(body).toHaveValue(FIRST);
    await expect(page.getByRole('radio', { name: '4점' })).toBeChecked();

    await body.fill(EDITED);
    await page.locator('label').filter({ hasText: '2점' }).first().click();
    await page.getByRole('button', { name: '저장' }).click();

    await page.waitForURL(/\/mypage\/reviews/);
    await expect(page.getByText('리뷰를 수정했습니다')).toBeVisible();

    // ── 손님 화면. 고친 글이 그대로 실리고, 고쳐졌다는 사실이 남는다
    await page.goto(PRODUCT);
    await ready(page);
    const reviews = page.getByRole('region', { name: /^리뷰/ });
    await expect(reviews.getByText(EDITED)).toBeVisible();
    await expect(reviews.getByText(FIRST)).toHaveCount(0);
    await expect(reviews.getByText('수정됨').first()).toBeVisible();
  } finally {
    /*
     * 지워서 원래 리뷰 수로 되돌린다. 미리 세어 둔 값은 더할 때보다 뺄 때 틀리므로, 되돌리는 쪽도 화면에서 밟는다.
     */
    await page.goto(PRODUCT);
    await ready(page);
    await page.getByRole('button', { name: '내 리뷰 삭제' }).first().click();
    await page.getByRole('button', { name: '삭제', exact: true }).first().click();
    await expect(page.getByText(EDITED)).toHaveCount(0);
  }
});

test('남의 리뷰는 고칠 화면조차 열리지 않는다', async ({ page }) => {
  /*
   * 시드가 심어 둔 리뷰는 후기만 남기고 간 사람들의 것이다. 그 id 를 알아내도 이 사람의 것이 아니다 —
   * 주소를 안다는 것과 고칠 수 있다는 것은 다르다.
   */
  const stolen = await page.request.patch('/api/reviews/not-my-review-id', {
    data: { content: '남의 글을 고쳐 봅니다. 열 자는 넘깁니다.' },
    failOnStatusCode: false,
  });
  expect([403, 404], `남의 리뷰를 고칠 수 있다 (${stolen.status()})`).toContain(stolen.status());
});
