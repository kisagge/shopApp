import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';
import { parseCsv } from '@shop/core';
import { STATE_FILE, ready } from './state';

/**
 * 주문 내려받기 → 송장 칸을 채워 → 다시 올리기.
 *
 * 단위 검사는 창구 둘을 따로 본다. 여기서 보는 것은 **둘이 맞물리는가**다 —
 * 내려받은 파일이 곧 올리는 양식이라고 화면에 적어 두었는데, 머리칸 이름이
 * 한 글자만 어긋나도 그 말은 거짓이 된다. 그리고 파일이 브라우저에서 실제로
 * 받아지는가(blob 링크)는 단위 검사가 볼 수 없다.
 *
 * **아무것도 바꾸지 않는다.** 송장 등록은 되돌릴 수 없는 전이라(배송중에서
 * 돌아가는 길이 없다) 시드 주문에 붙이면 다음 실행이 쓸 것이 없어진다. 실제
 * 등록은 order-lifecycle 이 자기 주문을 만들어 밟고, 일괄 창구가 그 함수를
 * 그대로 부른다는 것은 shipment-bulk-route 가 지킨다.
 */

async function download(page: Page): Promise<{ bytes: Buffer; rows: string[][] }> {
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'CSV 내려받기' }).click(),
  ]);
  const path = await file.path();
  const bytes = await readFile(path);
  return { bytes, rows: parseCsv(bytes.toString('utf8')) };
}

/*
 * **구매확정으로 거른다.** 시드가 만드는 주문은 리뷰를 쓰기 위한 구매확정뿐이다 — 개발 DB 에
 * 배송완료가 있다고 그걸로 걸었다가, 새로 만든 DB 에서 도는 문지기에서 "주문이 없다" 로 졌다.
 */
const STATUS = { code: 'CONFIRMED', label: '구매확정' } as const;

test('운영자가 걸어 둔 조건 그대로 내려받는다', async ({ page }) => {
  await page.goto(`/admin/orders?status=${STATUS.code}`);
  await ready(page);

  const { bytes, rows } = await download(page);
  await expect(page.getByText('주문 파일을 내려받았습니다.')).toBeVisible();

  // 한국어 엑셀이 한글을 깨뜨리지 않게 BOM 으로 시작한다
  expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);

  const [header, ...body] = rows;
  expect(header).toEqual(expect.arrayContaining(['주문번호', '받는 사람', '택배사', '송장번호']));
  expect(body.length, `${STATUS.label} 주문이 없어 이 검사가 아무것도 증명하지 않는다`).toBeGreaterThan(0);

  const status = header!.indexOf('상태');
  expect(new Set(body.map((r) => r[status])), '화면의 조건과 다른 주문이 섞였다').toEqual(new Set([STATUS.label]));

  // 목록 첫 쪽의 주문이 파일에 있다
  const firstNo = (await page.getByRole('region', { name: '주문 목록' }).getByRole('link').first().textContent())!.trim();
  expect(body.map((r) => r[0])).toContain(firstNo);
});

test('가맹점 파일에는 손님 계정의 값이 없다', async ({ browser }) => {
  const context = await browser.newContext({ storageState: STATE_FILE.merchant });
  try {
    const page = await context.newPage();
    await page.goto('/admin/orders');
    await ready(page);

    const { bytes, rows } = await download(page);
    const [header] = rows;
    expect(header).not.toContain('이메일');
    expect(header).not.toContain('주문자');
    expect(rows.length, '가맹점 주문이 시드에 없어 이 검사가 아무것도 증명하지 않는다').toBeGreaterThan(1);
    // 손님 계정의 이메일이 어느 칸에도 없다
    expect(bytes.toString('utf8')).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
  } finally {
    await context.close();
  }
});

test('내려받은 파일을 그대로 다시 올리면 아무것도 새로 등록하지 않는다', async ({ page }) => {
  /*
   * **머리칸을 알아듣는가**를 본다 — 못 알아들으면 표 대신 "머리칸이 없습니다" 한 줄이 뜬다.
   *
   * 그리고 **아무것도 바뀌지 않아야 한다.** 송장이 빈 줄은 건너뛰고, 이미 송장이 찬 줄은
   * 같은 값이라 건드리지 않는다. 처음에는 후자를 "N건 등록" 으로 세고 감사 로그를 줄마다
   * 쌓았다 — 이 검사가 개발 DB 에서 처음 돌 때 잡았다. 새로 만든 DB 에는 송장이 붙은 주문이
   * 없어 그 갈래는 여기서 늘 밟히지 않으므로, 그 자리는 shipment-bulk-route 가 지킨다.
   */
  await page.goto(`/admin/orders?status=${STATUS.code}`);
  await ready(page);

  const { bytes, rows } = await download(page);
  expect(rows.length, `${STATUS.label} 주문이 없다`).toBeGreaterThan(1);

  await page.getByLabel('CSV 파일').setInputFiles({ name: 'orders.csv', mimeType: 'text/csv', buffer: bytes });
  await page.getByRole('button', { name: '송장 올리기' }).click();

  await expect(page.getByText(/^0건 등록/)).toBeVisible();
  // 화면 전체의 alert 를 세면 Next 의 경로 알림이 함께 잡힌다 — 이 영역 안만 본다
  await expect(page.getByRole('region', { name: '내려받기 · 일괄 처리' }).getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('table', { name: /등록하지 못한 줄/ })).toHaveCount(0);
});

test('틀린 줄은 줄 번호와 사유로 돌려준다', async ({ page }) => {
  await page.goto('/admin/orders');
  await ready(page);

  const csv = '주문번호,택배사,송장번호\r\n19990101-0000000,CJ대한통운,123456789012\r\n19990101-0000001,비둘기택배,123456789012\r\n';
  await page.getByLabel('CSV 파일').setInputFiles({ name: 'fix.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.getByRole('button', { name: '송장 올리기' }).click();

  await expect(page.getByText('0건 등록, 2건 실패')).toBeVisible();
  const failures = page.getByRole('table', { name: /등록하지 못한 줄/ });
  await expect(failures.getByRole('row', { name: /19990101-0000000.*주문을 찾을 수 없습니다/ })).toBeVisible();
  await expect(failures.getByRole('row', { name: /19990101-0000001.*비둘기택배/ })).toBeVisible();
});
