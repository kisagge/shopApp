import { test, expect, type Page } from '@playwright/test';
import { STATE_FILE, RACE_PRODUCT, ready } from './state';

/**
 * 찜과 재입고 알림 — 손님이 거는 곳(상품 화면)과 모아 보는 곳(마이페이지)이 이어지는가.
 *
 * 단위 검사는 신청 조건·알림 발송을 따로 본다. 여기서 보는 것은 **사람이 밟는 길**이다. 이 길은 한동안 끊겨
 * 있었다 — 품절 옵션이 눌리지 않게 막혀 있어서, 품절 옵션을 골라야 뜨는 재입고 알림 신청이 **어느 상품에서도
 * 열리지 않았다.** 예전 검사는 품절 상품을 찾아 들어가 "품절" 글자만 보고 끝나서 그걸 몰랐다.
 *
 * 자기 손님(wishlistRestock)과 자기 상품(RACE_PRODUCT.restock)을 쓴다. 한 옵션의 재고를 0 으로 내렸다가 운영 화면에서
 * 되돌리므로, 끝나면 무슨 일이 있어도 원래 숫자로 돌린다.
 */

test.use({ storageState: STATE_FILE.wishlistRestock });
test.describe.configure({ mode: 'serial' });

const PRODUCT = `/product/${RACE_PRODUCT.restock}`;

/**
 * 찜 단추를 누르고 **저장이 끝날 때까지** 기다린다. 단추는 누르는 순간 이름을 바꾸고(낙관적 갱신) 저장은 뒤에서
 * 끝난다 — 이름만 보고 곧바로 다른 화면으로 가면 요청이 끊겨 찜이 안 남는다. 실제로 그렇게 한 번 졌다.
 */
async function toggleWish(page: Page, button: import('@playwright/test').Locator): Promise<void> {
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/wishlist/') && r.request().method() !== 'GET'),
    button.click(),
  ]);
  expect(response.ok(), `찜 저장이 실패했다 (${response.status()})`).toBe(true);
}

async function productName(page: Page): Promise<string> {
  return (await page.getByRole('heading', { level: 1 }).textContent())!.trim();
}

test('상품 화면에서 찜하면 찜 목록에 모이고, 목록에서 풀면 상품 화면도 풀린 상태다', async ({ page }) => {
  await page.goto(PRODUCT);
  await ready(page);
  const name = await productName(page);

  // 앞선 실행이 남긴 찜이 있으면 먼저 푼다 — 버튼 이름이 상태를 말한다
  const remove = page.getByRole('button', { name: `${name} 찜 해제` });
  if (await remove.count()) {
    await toggleWish(page, remove);
    await expect(page.getByRole('button', { name: `${name} 찜하기` })).toBeVisible();
  }

  await toggleWish(page, page.getByRole('button', { name: `${name} 찜하기` }));
  await expect(page.getByRole('button', { name: `${name} 찜 해제` })).toBeVisible();

  await page.goto('/mypage/wishlist');
  await ready(page);
  const item = page.getByRole('article').filter({ hasText: name });
  await expect(item).toHaveCount(1);
  await expect(item.getByRole('link')).toHaveAttribute('href', PRODUCT);

  // 목록에서 푼다 — 새로 고치면 줄이 없다
  await toggleWish(page, item.getByRole('button', { name: `${name} 찜 해제` }));
  await expect(item.getByRole('button', { name: `${name} 찜하기` })).toBeVisible();
  await expect.poll(async () => {
    await page.reload();
    await ready(page);
    return page.getByRole('article').filter({ hasText: name }).count();
  }, { timeout: 15_000 }).toBe(0);

  await page.goto(PRODUCT);
  await ready(page);
  await expect(page.getByRole('button', { name: `${name} 찜하기` })).toBeVisible();
});

test('품절 옵션을 골라 재입고 알림을 걸면, 운영이 재고를 채울 때 알림이 오고 목록에 재입고됨이 붙는다', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const admin = await browser.newContext({ storageState: STATE_FILE.admin });
  const ap = await admin.newPage();

  // 앞선 실행이 남긴 알림 신청을 지운다
  await page.goto('/mypage/restock');
  await ready(page);
  for (let i = 0; i < 10; i += 1) {
    const del = page.getByRole('button', { name: /재입고 알림 삭제$/ }).first();
    if ((await del.count()) === 0) break;
    await del.click();
    await expect(del).toHaveCount(0, { timeout: 10_000 }).catch(() => {});
  }

  await page.goto(PRODUCT);
  await ready(page);
  const name = await productName(page);

  // ── 운영: 이 상품의 옵션 하나(첫 옵션)를 품절로
  const found = (await (await ap.request.get(`/api/admin/products/search?q=${encodeURIComponent(name)}`)).json()) as {
    products: { id: string; name: string }[];
  };
  const productId = found.products.find((p) => p.name === name)?.id;
  expect(productId, `운영 검색이 "${name}" 을 못 찾았다`).toBeTruthy();

  await ap.goto(`/admin/products/${productId}`);
  await ready(ap);
  const stockTable = ap.getByRole('region', { name: '옵션별 재고' });
  const firstInput = stockTable.getByRole('spinbutton').first();
  const variantId = (await firstInput.getAttribute('id'))!.replace(/^stock-/, '');
  const optionLabel = (await stockTable.getByRole('row').nth(1).getByRole('cell').first().textContent())!.trim();
  const original = Number(await firstInput.inputValue());
  expect(original, '시드 재고가 0 이면 "없다가 생긴" 알림을 부를 수 없다').toBeGreaterThan(0);

  const setStockByApi = (stock: number) =>
    ap.request.patch(`/api/admin/products/${productId}/stock`, { data: { variants: [{ variantId, stock }] } });

  try {
    const zero = await setStockByApi(0);
    expect(zero.ok(), `재고를 0 으로 못 내렸다 (${zero.status()})`).toBe(true);

    // ── 손님: 품절 옵션도 고를 수 있고, 고르면 담기 대신 재입고 알림이 뜬다
    await page.reload();
    await ready(page);
    const [color, size] = optionLabel.split(' / ');
    /*
     * **키보드만으로 간다.** 품절 옵션을 고를 수 있게 바꾸면서 화살표가 품절 옵션에도 멈춘다 — 실제 브라우저에서 탭으로
     * 묶음에 들어가 화살표로 옮기면 옮기는 순간 골라지고, 품절이면 이름과 알림 영역이 말하는지 본다.
     */
    const pickByKeyboard = async (value: string) => {
      const target = new RegExp(`^${value}( 품절)?$`);
      for (const group of await page.getByRole('radiogroup').all()) {
        if ((await group.getByRole('radio', { name: target }).count()) === 0) continue;
        // 묶음의 탭 멈춤 칸(고른 것 또는 첫 칸)에 초점을 둔다 — 로빙 tabindex 로 하나만 0 이다
        await group.locator('[role="radio"][tabindex="0"]').focus();
        const radio = group.getByRole('radio', { name: target });
        // 화살표만 누른다 — 옮길 때마다 골라지고 초점이 따라간다. 끝에서는 처음으로 돈다
        for (let i = 0; i < 10 && !(await radio.evaluate((el) => el === document.activeElement)); i += 1) {
          await page.keyboard.press('ArrowRight');
        }
        await expect(radio).toBeFocused();
        // 이미 멈춤 칸이면 화살표를 안 눌러 아직 안 골라졌다 — 네이티브 라디오처럼 스페이스로 고른다
        if ((await radio.getAttribute('aria-checked')) !== 'true') await page.keyboard.press('Space');
        await expect(radio).toHaveAttribute('aria-checked', 'true');
        return;
      }
      throw new Error(`옵션 ${value} 를 못 찾았다`);
    };
    /*
     * **한 번 고르고 마는 대신 될 때까지 다시 고른다.**
     *
     * 품절 표시는 **이미 고른 다른 그룹과 조합해** 정해진다(product-options 의 availability) —
     * 색을 고르기 전의 L 은 다른 색에 재고가 있으면 품절이 아니다. 그래서 색 고르기가
     * 한 번 미끄러지면(새로 고친 직후 아직 React 가 붙기 전에 누르면 그 상태가 버려진다)
     * 사이즈만 골라진 채 이름에 "품절" 이 안 붙고, 그 모습은 "재고를 0 으로 못 내렸다" 와
     * 똑같이 보인다. 실제로 그렇게 한 번 졌다.
     */
    await expect.poll(async () => {
      await pickByKeyboard(color!);
      if (size) await pickByKeyboard(size);
      const marked = await page
        .getByRole('radio', { checked: true, name: new RegExp(`${size ?? color} 품절`) })
        .count();
      if (marked === 0) {
        await page.reload();
        await ready(page);
      }
      return marked;
    }, { timeout: 20_000 }).toBe(1);
    await expect(page.getByRole('radio', { checked: true, name: new RegExp(`${size ?? color} 품절`) })).toBeFocused();
    await expect(page.getByRole('status').filter({ hasText: `${optionLabel} 은(는) 품절입니다.` })).toHaveCount(1);
    await expect(page.getByRole('button', { name: '장바구니 담기' })).toHaveCount(0);

    // 다음 탭이 재입고 알림 신청 — Enter 로 누른다
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: `${optionLabel} 재입고 알림 신청` })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByText('재입고되면 알려 드리겠습니다.', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: `${optionLabel} 재입고 알림 해제` })).toBeVisible();

    // ── 손님: 마이페이지에 걸어 둔 알림이 보인다(아직 재입고 전)
    await page.goto('/mypage/restock');
    await ready(page);
    // 안내가 실제로 나가는 경로를 말한다 — 아래에서 알림함 알림이 오는 것을 확인한다
    await expect(page.getByText(/알림함과 메일로 알려 드리고/)).toBeVisible();
    await expect(page.getByText(/아직 연결되지 않아/)).toHaveCount(0);
    const row = page.getByRole('listitem').filter({ hasText: name }).filter({ hasText: optionLabel });
    await expect(row).toHaveCount(1);
    await expect(row.getByText('재입고됨')).toHaveCount(0);

    // ── 운영: 화면에서 재고를 원래대로 채운다 — 없다가 생긴 옵션이라 알림이 나간다
    await ap.reload();
    await ready(ap);
    await stockTable.getByLabel(`${optionLabel} 재고 수량`).fill(String(original));
    await ap.getByRole('button', { name: '재고 반영' }).click();
    await expect(ap.getByText(/옵션의 재고를 반영했습니다/)).toBeVisible({ timeout: 15_000 });

    // ── 손님: 알림함에 재입고 알림, 목록에 재입고됨
    await page.goto('/mypage/notifications');
    await ready(page);
    await expect(
      page.getByRole('list', { name: '알림' }).getByText(`${name} (${optionLabel}) 이(가) 다시 들어왔습니다.`).first(),
    ).toBeVisible();

    await page.goto('/mypage/restock');
    await ready(page);
    await expect(row.getByText('재입고됨')).toBeVisible();

    // 다 봤으면 지운다 — 줄 이름으로 어느 알림을 지우는지 읽힌다
    await row.getByRole('button', { name: `${name} 재입고 알림 삭제` }).click();
    await expect(row).toHaveCount(0, { timeout: 15_000 });
  } finally {
    await setStockByApi(original);
    await admin.close();
  }
});
