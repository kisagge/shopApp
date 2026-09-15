import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ready } from './state';

/**
 * 배송비 정책을 운영 화면에서 바꾼다.
 *
 * **예전에는 코드 상수였다.** 기본 배송비 3,000원, 무료 기준 5만원,
 * 도서산간 3,000원이 `packages/core/src/shipping.ts` 에 박혀 있어서, 무료
 * 기준을 3만원으로 내리려면 배포를 해야 했다. 운영에서 가장 자주 바뀌는 값
 * 중 하나가 그랬다.
 *
 * **여기서 보는 것은 값이 옮겨 갔는지가 아니라, 옮긴 값이 끝까지 닿는지다.**
 * 정책을 읽는 자리가 넷이다 — 견적(돈), 상품 화면의 안내, 비교의 무료배송
 * 표시, 배송지 목록의 도서산간 안내. 하나라도 옛 상수를 보고 있으면
 * **화면은 3만원이라고 적어 놓고 결제는 5만원으로 계산한다.**
 */

test.describe.configure({ mode: 'serial' });

/** 시드/기본값. 검사 끝에 이 값으로 돌려놓는다. */
const ORIGINAL = { baseFee: 3000, freeThreshold: 50_000, remoteSurcharge: 3000 } as const;
const CHANGED = { baseFee: 2500, freeThreshold: 30_000, remoteSurcharge: 4500 } as const;

/**
 * 배송비 정책을 저장한다.
 *
 * **응답이 아예 없을 때만 다시 보낸다.** 정책 저장은 통째로 덮어쓰므로 두 번 가도 결과가 같다. 연결이 한 번 끊긴
 * (ECONNRESET) 것으로 "말이 안 되는 값" 검사가 진 적이 있고, 그 뒤의 되돌려 놓기가 돌지 않아 다음 명세가 바뀐 배송비를
 * 봤다. 응답이 오면 그 답으로 판정한다 — 400 을 다시 보내 200 을 기다리지 않는다.
 */
async function save(page: Page, body: Record<string, number | null>) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await page.request.patch('/api/admin/shipping', { data: body, failOnStatusCode: false });
      return { status: res.status(), body: (await res.json()) as Record<string, unknown> };
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(300);
    }
  }
  throw lastError;
}

test('운영 화면에서 바꾸면 값이 남는다', async ({ page }) => {
  await page.goto('/admin/shipping');
  await ready(page);

  await expect(page.getByRole('heading', { name: '배송비', level: 1 })).toBeVisible();

  // 이 화면에는 반품지 폼도 있다 — 배송비 절 안에서 찾는다
  const policy = page.getByRole('region', { name: '현재 정책' });
  await policy.getByLabel('기본 배송비').fill(String(CHANGED.baseFee));
  await policy.getByLabel('무료배송 기준').fill(String(CHANGED.freeThreshold));
  await policy.getByLabel('제주·도서산간 추가 배송비').fill(String(CHANGED.remoteSurcharge));
  await policy.getByRole('button', { name: '저장' }).click();

  await expect(policy.getByRole('status')).toContainText('저장했습니다');

  // 새로 열어도 그대로여야 한다 — 화면 상태가 아니라 저장된 값을 본다
  await page.goto('/admin/shipping');
  await ready(page);
  await expect(page.getByLabel('무료배송 기준')).toHaveValue(String(CHANGED.freeThreshold));
});

test('바꾼 값이 손님 화면의 안내까지 간다', async ({ browser }) => {
  /*
   * **여기가 이 파일의 요점이다.** 저장은 됐는데 화면이 옛 상수를 읽고 있으면,
   * 고객은 상품 화면에서 "5만원 이상 무료" 를 읽고 결제에서 3만원 기준으로
   * 계산된 금액을 본다. 어느 쪽이 맞는지는 아무도 말해 주지 않는다.
   */
  const guest = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  try {
    const page = await guest.newPage();
    await page.goto('/product/oversized-wool-coat');
    await ready(page);

    const shipping = page.getByText(/무료/).first();
    await expect(shipping).toContainText('30,000');
    await expect(page.locator('#main')).toContainText('4,500');
  } finally {
    await guest.close();
  }
});

test('말이 안 되는 값은 저장되지 않는다', async ({ page }) => {
  /*
   * **무료 기준이 기본료보다 낮으면 뜻이 뒤집힌다.** 3,000원짜리 배송비에
   * 무료 기준이 2,000원이면 사실상 언제나 무료인데, 화면에는 "2,000원 이상
   * 무료배송" 이라고 적힌다 — 읽는 사람은 조건이 있는 줄 안다.
   */
  const low = await save(page, { baseFee: 3000, freeThreshold: 2000, remoteSurcharge: 3000 });
  expect(low.status, `기준이 기본료보다 낮은데 통과했다 (${JSON.stringify(low.body)})`).toBe(400);

  // 0 하나가 더 붙는 실수. 화면은 멀쩡히 그려지고 그 배송비를 치른 사람만 안다.
  const huge = await save(page, { baseFee: 3_000_000, freeThreshold: 50_000, remoteSurcharge: 3000 });
  expect(huge.status).toBe(400);

  const negative = await save(page, { baseFee: -1000, freeThreshold: 50_000, remoteSurcharge: 3000 });
  expect(negative.status).toBe(400);
});

test('무료배송을 안 하는 가게도 있다 — 빈 칸은 0 이 아니다', async ({ page }) => {
  const none = await save(page, { ...CHANGED, freeThreshold: null });
  expect(none.status, JSON.stringify(none.body)).toBe(200);
  expect(none.body['freeThreshold']).toBeNull();

  await page.goto('/admin/shipping');
  await ready(page);
  await expect(page.getByLabel('무료배송 기준')).toHaveValue('');
  await expect(page.locator('#main')).toContainText('무료배송을 하지 않습니다');
});

test('되돌려 놓는다', async ({ page }) => {
  // 남겨 두면 다음 실행과 다른 명세가 다른 배송비를 본다
  const back = await save(page, { ...ORIGINAL });
  expect(back.status, JSON.stringify(back.body)).toBe(200);
});
