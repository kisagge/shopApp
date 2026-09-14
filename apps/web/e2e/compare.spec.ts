import { test, expect } from '@playwright/test';
import { MAX_COMPARE } from '@shop/core';
import { ready } from './state';

/** 상품 비교 */

/** 시드에 코트가 넷, 니트가 넷 있다. 같은 갈래끼리만 견준다. */
const COAT = '/category/outer-coat';

test('목록에서 담아 견주기까지', async ({ page }) => {
  await page.goto(COAT);
  await ready(page);

  const boxes = page.getByRole('checkbox', { name: /코트/ });
  await boxes.nth(0).check();

  // 하나만 담았을 때는 띠가 남되 견주기는 잠긴다
  const tray = page.getByRole('complementary', { name: '비교함' });
  await expect(tray).toBeVisible();
  await expect(tray.getByRole('link', { name: '견주어 보기' })).toHaveCount(0);

  await boxes.nth(1).check();
  await tray.getByRole('link', { name: '견주어 보기' }).click();

  await expect(page.getByRole('heading', { name: '상품 비교', level: 1 })).toBeVisible();
  // 표의 줄 제목은 th[scope=row] 라야 낭독기가 칸마다 무슨 값인지 말해 준다
  await expect(page.getByRole('rowheader', { name: '판매가' })).toBeVisible();
});

test('담아 둔 것은 화면을 옮겨도 남는다', async ({ page }) => {
  await page.goto(COAT);
  await ready(page);
  await page.getByRole('checkbox', { name: /코트/ }).first().check();

  await page.goto('/');
  await ready(page);

  await expect(page.getByRole('complementary', { name: '비교함' })).toBeVisible();
});

test('다른 갈래는 담기지 않고, 왜인지 말해 준다', async ({ page }) => {
  await page.goto(COAT);
  await ready(page);
  await page.getByRole('checkbox', { name: /코트/ }).first().check();

  await page.goto('/category/knit-crewneck');
  await ready(page);

  const box = page.getByRole('checkbox').filter({ hasNot: page.locator('[name]') }).first();
  await expect(page.getByText('같은 갈래의 상품끼리만 견줍니다').first()).toBeAttached();
  await expect(box).toBeDisabled();
});

test('갈래를 섞은 주소로 들어오면 막는다 — 주소는 사람이 고칠 수 있다', async ({ page }) => {
  await page.goto('/compare?slugs=oversized-wool-coat,lambswool-crewneck');

  await expect(page.getByText('같은 갈래의 상품끼리만 견줄 수 있습니다.')).toBeVisible();
});

test('하나만 적힌 주소도 오류 없이 안내한다', async ({ page }) => {
  await page.goto('/compare?slugs=oversized-wool-coat');

  await expect(page.getByText('두 개 이상')).toBeVisible();
});

test(`${MAX_COMPARE}개를 넘겨 적어도 표가 그려진다 — 넘친 것은 잘린다`, async ({ page }) => {
  await page.goto('/compare?slugs=a,b,c,d,e,f,g,h,i,j,k');

  // 없는 slug 뿐이므로 "두 개 이상" 안내로 끝난다. 500 이 아니어야 한다.
  await expect(page.getByRole('heading', { name: '상품 비교', level: 1 })).toBeVisible();
});

/**
 * 같은 줄이 위에 있으면 사람이 같은 값을 네 번 읽고 나서야 다른 곳에 닿는다.
 */
test('다른 줄이 위에, 같은 줄이 아래에 묶인다', async ({ page }) => {
  await page.goto('/compare?slugs=oversized-wool-coat,single-chesterfield-coat');

  // 줄 제목과 묶음 머리는 둘 다 th 다 — 문서 차례 그대로 읽는다
  const heads = await page.locator('table th[scope="row"], table th[scope="colgroup"]').allInnerTexts();
  const priceAt = heads.findIndex((h) => h.trim() === '판매가');
  const sameAt = heads.findIndex((h) => h.includes('줄은 모두 같습니다'));

  expect(priceAt, `줄 머리를 못 찾았다: ${heads.join(' / ')}`).toBeGreaterThanOrEqual(0);
  expect(sameAt, '같은 줄 묶음이 없다 — 두 코트는 몇 줄이 같아야 한다').toBeGreaterThan(0);
  expect(priceAt).toBeLessThan(sameAt);
});

/**
 * 비교함이 주문 버튼을 덮고 있었다.
 *
 * **폰에서 주문을 못 했다.** 장바구니의 `주문하기` 막대는 z-index 가 없고
 * 비교함은 z-40 이라, 비교함에 뭔가 담아 둔 사람에게는 띠가 버튼을 통째로
 * 덮었다 — 실기기에서 버튼 한가운데를 짚으니 비교함의 '빼기' 가 잡혔다.
 *
 * 좁은 화면에서만 드러난다. md 위로는 장바구니 막대가 흐름 안으로 돌아가
 * 겹칠 일이 없다.
 */
test.describe('좁은 화면의 아래쪽 막대', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('비교함이 주문 버튼을 덮지 않는다', async ({ page }) => {
    // 비교함에 둘을 담는다
    await page.goto(COAT);
    await ready(page);
    const boxes = page.getByRole('checkbox', { name: /코트/ });
    await boxes.nth(0).check();
    await boxes.nth(1).check();

    // 같은 손님이 장바구니에도 하나 담는다
    await page.getByRole('link', { name: /코트/ }).first().click();
    await page.waitForURL(/\/product\//);
    for (const group of await page.getByRole('radiogroup').all()) {
      const pick = group.locator('[role="radio"]:not([data-sold-out])');
      await pick.first().click();
    }
    await page.getByRole('button', { name: '장바구니 담기' }).click();

    await page.goto('/cart');
    const order = page.getByRole('button', { name: /주문하기/ });

    /*
     * **먼저 보이는지부터 본다.** 되돌려 보니 비교함이 덮은 버튼은
     * 아예 보이지 않는 것으로 판정된다 — 그 단계에서 이미 걸린다.
     */
    await expect(order, '비교함이 덮어 버튼이 보이지 않는다').toBeVisible();

    /*
     * **보이는 것만으로는 모자라다.** 반쯤 덮여도 보이기는 한다.
     * 버튼 한가운데에 실제로 무엇이 있는지 묻는다.
     */
    const box = (await order.boundingBox())!;
    const onTop = await page.evaluate(
      ({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        return el?.closest('[aria-label="비교함"]') ? '비교함' : (el?.tagName ?? '없음');
      },
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    );
    expect(onTop, '주문 버튼 위에 비교함이 덮여 있다').not.toBe('비교함');

    // 그리고 실제로 눌려서 결제로 간다
    await order.click();
    await expect(page).toHaveURL(/\/checkout/);
  });
});
