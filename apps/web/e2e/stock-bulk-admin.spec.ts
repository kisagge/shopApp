import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';
import { csvDocument, parseCsv } from '@shop/core';
import { ready } from './state';

/**
 * 재고 내려받기 → 숫자 고쳐 → 올리기.
 *
 * 단위 검사는 파서·적용·창구를 따로 본다. 여기서 보는 것은 **둘이 맞물리는가**다: 내려받은 파일의
 * 머리칸을 올리는 쪽이 알아듣는지, 고친 숫자가 실제 재고가 되는지, 같은 줄은 건드리지 않는지.
 *
 * **올리는 것은 이 상품의 줄뿐이다.** 다른 명세가 안 쓰는 상품(울 비니, 재고 넉넉, 기준과 멀다)을
 * 고르고, 끝나면 원래 숫자로 되돌린다.
 */

const PRODUCT = '울 비니';
// 두 검사가 같은 옵션의 재고를 읽고 고친다 — 한 일꾼에서 차례로 돈다
test.describe.configure({ mode: 'default' });

async function download(page: Page): Promise<string[][]> {
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '재고 CSV 내려받기' }).click(),
  ]);
  return parseCsv((await readFile(await file.path())).toString('utf8'));
}

async function upload(page: Page, rows: string[][], header: readonly string[]): Promise<void> {
  await page.getByLabel('재고 CSV 파일').setInputFiles({
    name: 'stock.csv', mimeType: 'text/csv', buffer: Buffer.from(csvDocument(header, rows)),
  });
  await page.getByRole('button', { name: '재고 올리기' }).click();
}

test('내려받은 재고 파일의 숫자를 고쳐 올리면 그 옵션의 재고가 바뀌고, 그대로인 줄은 건너뛴다', async ({ page }) => {
  await page.goto('/admin/products');
  await ready(page);

  const [header, ...rows] = await download(page);
  const col = {
    sku: header!.indexOf('SKU'), product: header!.indexOf('상품'),
    base: header!.indexOf('내려받은 재고'), stock: header!.indexOf('재고'),
  };
  const mine = rows.filter((r) => r[col.product] === PRODUCT);
  expect(mine.length, `${PRODUCT} 의 옵션이 파일에 없다 — 시드를 본다`).toBeGreaterThanOrEqual(2);

  const [target, untouched] = mine;
  const original = target![col.stock]!;
  const changed = String(Number(original) + 7);

  try {
    // 한 줄은 고치고, 한 줄은 그대로 올린다
    await upload(page, [target!.map((v, i) => (i === col.stock ? changed : v)), untouched!], header!);
    await expect(page.getByText(/^1개 수정, 값이 같은 1개/)).toBeVisible({ timeout: 20_000 });

    const again = await download(page);
    const now = again.find((r) => r[col.sku] === target![col.sku]);
    expect(now?.[col.stock], '올린 숫자가 재고가 되지 않았다').toBe(changed);
  } finally {
    // 되돌린다 — 이 옵션의 줄만. 기준은 지금 값(고친 숫자)이다. 처음 받은 파일 그대로면 "고치지 않은 줄" 이다
    await upload(page, [target!.map((v, i) => (i === col.base ? changed : v))], header!);
    // 앞 결과("1개 수정, 값이 같은 1개")와 글자가 달라야 이번 결과를 본 것이다
    await expect(page.getByText('1개 수정', { exact: true })).toBeVisible({ timeout: 20_000 });
  }
});

/**
 * **받은 뒤 움직인 재고는 옛 파일로 덮지 않는다.** 예전에는 받은 뒤 팔린 수량을 되살렸다. 판매를
 * 기다리지 않고, "받을 때는 지금보다 하나 많았다" 고 적힌 파일을 올린다 — 받은 뒤 하나가 팔린 것과 같다.
 */
test('받은 뒤 재고가 움직였으면 고친 줄을 반영하지 않고, 손대지 않은 줄은 되돌리지 않는다', async ({ page }) => {
  await page.goto('/admin/products');
  await ready(page);

  const [header, ...rows] = await download(page);
  const col = {
    sku: header!.indexOf('SKU'), product: header!.indexOf('상품'),
    base: header!.indexOf('내려받은 재고'), stock: header!.indexOf('재고'),
  };
  const [target, untouched] = rows.filter((r) => r[col.product] === PRODUCT);
  const now = Number(target![col.stock]);
  const staleUntouched = String(Number(untouched![col.stock]) + 1);

  await upload(page, [
    // 받을 때 now+1 이었고 now+5 로 고쳤다 — 그사이 하나 팔렸다
    target!.map((v, i) => (i === col.base ? String(now + 1) : i === col.stock ? String(now + 5) : v)),
    // 받을 때 +1 이었고 손대지 않았다 — 되살리면 안 된다
    untouched!.map((v, i) => (i === col.base || i === col.stock ? staleUntouched : v)),
  ], header!);

  await expect(page.getByText(/^0개 수정, 값이 같은 1개, 1건 실패/)).toBeVisible({ timeout: 20_000 });
  const failures = page.getByRole('table', { name: /고치지 못한 줄/ });
  await expect(failures.getByRole('row', { name: new RegExp(`${target![col.sku]}.*내려받을 때 ${now + 1}개, 지금 ${now}개`) }))
    .toBeVisible();

  const again = await download(page);
  expect(again.find((r) => r[col.sku] === target![col.sku])?.[col.stock]).toBe(String(now));
  expect(again.find((r) => r[col.sku] === untouched![col.sku])?.[col.stock]).toBe(untouched![col.stock]);
});

test('틀린 숫자와 없는 SKU 는 줄 번호와 사유로 돌려주고 아무것도 바꾸지 않는다', async ({ page }) => {
  await page.goto('/admin/products');
  await ready(page);

  const header = ['SKU', '재고'];
  await upload(page, [['E2E-NO-SUCH-SKU', '3'], ['ANOTHER-NONE', '1.5']], header);

  await expect(page.getByText('0개 수정, 2건 실패')).toBeVisible({ timeout: 20_000 });
  const failures = page.getByRole('table', { name: /고치지 못한 줄/ });
  await expect(failures.getByRole('row', { name: /ANOTHER-NONE.*정수/ })).toBeVisible();
  await expect(failures.getByRole('row', { name: /E2E-NO-SUCH-SKU.*없는 SKU/ })).toBeVisible();
});
