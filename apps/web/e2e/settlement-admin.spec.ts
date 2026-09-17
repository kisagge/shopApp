import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { parseCsv, previousYearMonth, SETTLEMENT_STATUS_LABEL } from '@shop/core';
import { STATE_FILE, ready } from './state';

/**
 * 가맹점에게 돈이 나가는 길.
 *
 * **이 화면은 훑기만 당하고 있었다.** 자리·대비·접근성 검사가 열어 보기는
 * 했지만 아무도 숫자를 읽지 않았고, 확정도 지급도 한 번 눌러 본 적이 없다.
 * 단위 검사(close-settlement.test.ts)는 계산기를 재는데, 그 계산기의 답이
 * 화면에 나오는지와 단추가 실제로 그 일을 하는지는 다른 이야기다.
 *
 * 여기서 보는 것은 넷이다.
 *
 * 1. **줄이 서로 맞는가** — 매출에서 수수료와 환불을 빼면 지급액이어야 한다.
 * 2. **아직 안 끝난 기간은 못 얼린다** — 얼리면 그 뒤 매출이 영영 빠진다.
 * 3. **확정과 지급은 다른 사람이 한다** — 한 사람이 돈을 빼는 길을 끝까지
 *    걸어갈 수 없어야 한다. 권한 표가 그렇게 적혀 있고, 화면도 그래야 한다.
 * 4. **두 번 지급되지 않는다** — 여기서 틀리면 돈이 두 번 나간다.
 */

test.describe.configure({ mode: 'serial' });

const PERIOD = previousYearMonth(new Date());

/**
 * 문구를 손으로 적지 않는다.
 *
 * 처음에 '지급완료' 라고 적었는데 화면은 '지급 완료' 다 — 15초를 기다리다
 * 실패했고, 실패 메시지는 "안 바뀌었다" 였다. 이름표가 바뀌어도 검사는
 * 따라와야 한다.
 */
const PAID = SETTLEMENT_STATUS_LABEL.PAID;

/**
 * "−12,000" · "—" · "-5,520" · "289,000" → 숫자. 없는 칸은 0 이다.
 *
 * **부호를 버리면 안 된다.** 환불이 매출보다 많으면 지급액이 음수가 된다 —
 * 가맹점이 우리에게 돌려줄 돈이다. 처음에 숫자만 긁어 와서 −5,520 을
 * 5,520 으로 읽었고, 그 줄을 두고 금액이 틀렸다고 우겼다.
 */
function wonOf(text: string): number {
  const trimmed = text.trim();
  if (trimmed === '—') return 0;
  const negative = /^[−-]/.test(trimmed);
  const digits = trimmed.replace(/[^\d]/g, '');
  expect(digits, `금액을 못 읽었다: "${text}"`).not.toBe('');
  return negative ? -Number(digits) : Number(digits);
}

/**
 * 한 표의 줄들을 **머리칸 이름으로** 읽는다.
 *
 * 칸 순서로 읽었더니, 이월 칸이 하나 늘자 지급액을 환불 칸에서 읽어 멀쩡한 확정을 틀렸다고 했다. 이월 칸은 넘어온
 * 빚이 있을 때만 생기므로 순서는 기간마다 달라진다 — 이름으로 찾는다.
 */
async function rows(page: Page, label: string): Promise<Record<string, string>[]> {
  const region = page.getByRole('region', { name: label });
  const headers = (await region.locator('thead th').allInnerTexts()).map((h) => h.trim());
  const table = region.locator('tbody tr');
  const count = await table.count();
  const out: Record<string, string>[] = [];
  for (let i = 0; i < count; i += 1) {
    const cells = await table.nth(i).locator('td').allInnerTexts();
    out.push(Object.fromEntries(headers.map((h, j) => [h, cells[j] ?? ''])));
  }
  return out;
}

/** 한 줄의 칸. 없는 칸을 부르면 그 자리에서 말한다 — 조용히 빈 글자로 읽으면 0 원이 된다 */
function cell(row: Record<string, string>, name: string): string {
  const value = row[name];
  expect(value, `"${name}" 칸이 없다 — 머리칸: ${Object.keys(row).join(', ')}`).toBeDefined();
  return value!;
}

async function openPeriod(page: Page, yearMonth: string): Promise<void> {
  await page.goto(`/admin/settlements?period=${yearMonth}`);
  await ready(page);
  await expect(page.getByRole('heading', { name: /정산 초안/ })).toBeVisible();
}

/**
 * 화면이 이 기간을 부르는 이름("2026년 8월 1일 ~ 2026년 8월 31일").
 *
 * **내역 표에는 다른 기간의 줄이 섞여 있다.** 가맹점 이름만으로 맞대면 옛
 * 기간의 금액과 이번 초안을 견주게 된다 — 처음에 그렇게 짜서 "무어의 확정
 * 금액이 초안과 다르다" 는 거짓 실패를 봤다. 날짜를 손으로 만들지 않고
 * 화면이 쓴 글자를 그대로 가져다 고른다.
 */
async function periodLabel(page: Page): Promise<string> {
  const line = await page.getByText('구매확정 기준').innerText();
  const label = line.split('·')[0]!.trim();
  expect(label, `기간 이름을 못 읽었다: "${line}"`).toMatch(/~/);
  return label;
}

test('초안의 줄이 서로 맞는다', async ({ page }) => {
  await openPeriod(page, PERIOD);

  const draft = await rows(page, '정산 미리보기');
  expect(
    draft.length,
    `${PERIOD} 에 정산할 가맹점이 없다 — 시드가 구매확정 주문을 안 남겼다`,
  ).toBeGreaterThan(0);

  /*
   * **화면에 적힌 대로 더한다.** 수수료와 환불 칸은 이미 "−399,840" 처럼
   * 부호를 달고 나온다 — 거기서 또 빼면 두 번 빼는 셈이다. 처음에 그렇게
   * 짜서 멀쩡한 줄을 틀렸다고 읽었다. 읽는 사람이 눈으로 더하는 것과 같은
   * 셈을 한다.
   */
  let sum = 0;
  for (const row of draft) {
    const [gross, commission, refund, net] = ['확정 매출', '수수료', '환불', '지급액'].map((n) => cell(row, n));
    // 앞선 달에서 넘어온 빚도 이미 부호를 달고 나온다. 넘어온 것이 없는 기간에는 칸이 없다
    const carried = row['이월 차감'] ?? '—';
    const expected = wonOf(gross!) + wonOf(commission!) + wonOf(refund!) + wonOf(carried);
    expect(
      wonOf(net!.split('\n')[0]!),
      `${cell(row, '가맹점')} — 매출 ${gross} 수수료 ${commission} 환불 ${refund} 이월 ${carried} 인데 지급액이 ${net} 이다`,
    ).toBe(expected);
    sum += wonOf(net!.split('\n')[0]!);
  }

  // 합계가 줄과 따로 계산되면 사람은 어느 쪽을 믿어야 할지 모른다
  const total = await page.getByRole('row', { name: /지급액 합계/ }).locator('td').first().innerText();
  expect(wonOf(total), '지급액 합계가 줄의 합과 다르다').toBe(sum);
});

test('내려받은 내역의 합이 초안과 같다', async ({ page }) => {
  /*
   * 가맹점은 합계 한 줄이 아니라 **어느 주문에서 온 숫자인지** 맞춰 봐야 한다. 그 파일의 합이 화면의
   * 정산과 다르면 둘 다 믿을 수 없다 — 줄을 고르는 조건을 초안과 한 함수로 둔 이유다. 여기서는 사람이
   * 받는 그대로(링크) 받아 가맹점마다 판매 줄 수·판매 합·지급액을 초안의 줄과 맞춘다.
   */
  await openPeriod(page, PERIOD);
  const draft = await rows(page, '정산 미리보기');

  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: '내역 CSV 내려받기', exact: true }).click(),
  ]);
  const [header, ...lines] = parseCsv((await readFile(await file.path())).toString('utf8'));
  expect(header).toEqual(['구분', '가맹점', '주문번호', '기준일시', '상품', '옵션', '수량', '금액']);

  for (const row of draft) {
    const count = cell(row, '건수');
    const gross = cell(row, '확정 매출');
    const net = cell(row, '지급액').split('\n')[0]!;
    // 첫 칸은 "무어수수료 12%" 처럼 수수료율이 붙어 나온다
    const name = cell(row, '가맹점').split('수수료')[0]!.trim();
    const mine = lines.filter((l) => l[1] === name);
    const sales = mine.filter((l) => l[0] === '판매');
    const payout = mine.find((l) => l[0] === '합계 · 지급액');

    expect(sales.length, `${name} 판매 줄 수가 초안의 건수와 다르다`).toBe(Number(count.replace(/[^\d]/g, '')));
    if (sales.length === 0 && !payout) continue;
    expect(sales.reduce((sum, l) => sum + Number(l[7]), 0), `${name} 판매 합이 초안과 다르다`).toBe(wonOf(gross));
    expect(Number(payout?.[7]), `${name} 지급액이 초안과 다르다`).toBe(wonOf(net));
  }
});

test('아직 안 끝난 기간은 얼리지 못한다', async ({ page }) => {
  /*
   * **이달을 확정하면 오늘 이후의 매출이 영영 빠진다.** 정산은 다시 계산되지
   * 않는 숫자를 남기는 일이라 되돌릴 수 없다. 단추를 아예 세우지 않는다.
   */
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  await openPeriod(page, thisMonth);

  await expect(page.getByText('진행 중인 기간 — 확정할 수 없습니다')).toBeVisible();
  await expect(page.getByRole('button', { name: /정산 확정/ })).toHaveCount(0);
});

test('확정하면 초안의 숫자가 그대로 얼어붙는다', async ({ page }) => {
  await openPeriod(page, PERIOD);
  const label = await periodLabel(page);

  // 이름 칸에는 "STUDIO NOON 수수료 10%" 처럼 수수료율이 붙어 온다
  /*
   * 가맹점 칸에는 이름 아래에 한 줄이 더 있다 — 초안 표는 수수료율, 내역 표는 보낼 곳(은행·뒤 네 자리·예금주).
   * 이름으로 맞춰 보려면 첫 줄만 읽는다.
   */
  const nameOf = (cell: string): string =>
    cell.split('\n')[0]!.replace(/\s*수수료\s*[\d.]+%\s*$/, '').trim();
  const ofPeriod = async (): Promise<Map<string, number>> =>
    new Map(
      (await rows(page, '확정된 정산 내역'))
        .filter((r) => cell(r, '기간').trim() === label)
        .map((r) => [nameOf(cell(r, '가맹점')), wonOf(cell(r, '지급액'))]),
    );

  const draft = await rows(page, '정산 미리보기');
  const before = new Map(draft.map((r) => [
    nameOf(cell(r, '가맹점')),
    { net: wonOf(cell(r, '지급액').split('\n')[0]!), status: cell(r, '상태') },
  ]));
  const frozenBefore = await ofPeriod();

  await page.getByRole('button', { name: `${PERIOD} 정산 확정` }).click();
  await page.getByRole('button', { name: '확정', exact: true }).click();
  await expect(page.getByRole('status')).toContainText(`${PERIOD} 정산을 확정했습니다`);

  // 건드리지 않은 것이 있으면 몇 건인지 말해 준다 — 조용히 넘어가면 안 된다
  const untouched = [...before.values()].filter((v) => !v.status.includes('미확정')).length;
  if (untouched > 0) {
    await expect(page.getByRole('status')).toContainText(`이미 확정·지급된 ${untouched}건`);
  }

  // 초안 표의 상태 칸이 "미확정" 에서 벗어난다
  await expect
    .poll(async () => (await rows(page, '정산 미리보기')).every((r) => !cell(r, '상태').includes('미확정')))
    .toBe(true);

  const frozen = await ofPeriod();
  expect(frozen.size, `확정했는데 ${label} 줄이 내역에 없다`).toBe(before.size);

  for (const [merchant, { net, status }] of before) {
    const after = frozen.get(merchant);
    expect(after, `내역에 ${merchant} 줄이 없다`).toBeDefined();

    if (!status.includes('미확정')) {
      /*
       * **한 번 확정한 숫자는 다시 계산하지 않는다.** 그것이 이 기능의 전부다 —
       * 그 뒤로 상품 값이나 수수료율이 바뀌어도, 그때 얼린 숫자가 그때 약속한
       * 돈이다. 초안 금액으로 덮이면 장부와 통장이 갈린다.
       *
       * 새 DB 로 도는 CI 는 이 갈래에 안 온다 — 확정된 것이 없기 때문이다.
       * 같은 기계에서 두 번째로 돌릴 때 여기로 온다.
       */
      expect(after, `${merchant} 는 이미 확정됐는데 금액이 다시 계산됐다`).toBe(
        frozenBefore.get(merchant),
      );
      continue;
    }

    /*
     * **사람이 보고 누른 금액과 남는 금액이 같아야 한다.** 확정이 따로
     * 계산하면 화면의 숫자는 안내문일 뿐이 된다.
     */
    expect(after, `${merchant} 의 확정 금액이 초안과 다르다`).toBe(net);
  }
});

test('관리자는 지급을 집행하지 못한다', async ({ page }) => {
  /*
   * **권한 표에 적힌 것이 화면에도 그대로 있어야 한다.** 계정을 만들어
   * 스스로 권한을 올리거나 돈을 빼는 경로를 한 사람이 완결하지 못하게
   * 나눈 것이 이 앱의 판단이다. 관리자는 확정까지다.
   */
  await openPeriod(page, PERIOD);

  await expect(page.getByRole('button', { name: /정산 확정/ }), '확정은 할 수 있어야 한다')
    .toBeVisible();
  await expect(
    page.getByRole('columnheader', { name: '지급', exact: true }),
    '관리자 화면에 지급 칸이 있다',
  ).toHaveCount(0);
});

test('지급은 슈퍼관리자가 하고, 두 번 나가지 않는다', async ({ browser }) => {
  const context = await browser.newContext({ storageState: STATE_FILE.superAdmin });
  try {
    const page = await context.newPage();
    await openPeriod(page, PERIOD);

    await expect(
      page.getByRole('columnheader', { name: '지급', exact: true }),
      '슈퍼관리자에게 지급 칸이 없다',
    ).toBeVisible();

    const pay = page.getByRole('button', { name: /지급$/ }).first();
    if ((await pay.count()) === 0) {
      /*
       * 앞선 실행이 이 기간을 이미 다 지급했다. **CI 는 늘 새 DB 라 여기까지
       * 온 적이 없다** — 개발 기계에서 두 번째로 돌릴 때만 닿는 길이다.
       * 조용히 통과하지 않고 건너뛴다고 말한다.
       */
      const history = await rows(page, '확정된 정산 내역');
      expect(history.some((r) => cell(r, '상태').includes(PAID)), `단추도 없고 ${PAID} 도 없다`).toBe(true);
      test.skip(true, '이 기간은 앞선 실행이 이미 지급했다');
      return;
    }

    // 두 번째 요청을 보내려면 이 줄의 주소를 알아야 한다. 누를 때 새어 나온다.
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/pay') && r.request().method() === 'POST'),
      pay.click(),
    ]);
    expect(response.status(), '지급 요청이 거절됐다').toBe(200);

    await expect
      .poll(async () => (await rows(page, '확정된 정산 내역')).some((r) => cell(r, '상태').includes(PAID)))
      .toBe(true);

    /*
     * **여기가 이 파일의 요점이다.** 지급은 돈이 실제로 나가는 한 번이다.
     * 새로고침이 늦었거나 두 사람이 같이 눌렀을 때 두 번 나가면 안 된다.
     * 화면이 단추를 감추는 것과 **서버가 거절하는 것**은 다른 일이다 —
     * 앞엣것만 있으면 주소를 아는 사람이 한 번 더 부를 수 있다.
     */
    const again = await page.request.post(response.url());
    expect(again.ok(), `이미 지급한 정산에 또 지급이 나갔다 (${again.status()})`).toBe(false);
  } finally {
    await context.close();
  }
});
