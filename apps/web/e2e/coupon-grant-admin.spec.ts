import { test, expect } from '@playwright/test';
import { SEED_ACCOUNT } from '@shop/auth/seed-fixtures';
import { ready } from './state';

/**
 * 운영진이 쿠폰을 **손으로 쥐어 준다** — 찾고, 고르고, 빼고, 지급한다.
 *
 * 규칙(수량·중복·대상)은 단위 검사와 창구 검사가 본다. 여기서 보는 것은 **그 창구를 사람이 쓰는 길**이다.
 * 이 화면은 지금까지 창구로만 두드려졌다(알림 문구 명세가 `/issue` 를 직접 부른다) — 찾기·고르기·빼기·지급을
 * 진짜 브라우저에서 밟아 본 적이 없다. 그래서:
 *
 * - **엔터로도 찾는다.** 그 자리는 폼이 아니라 단추 옆의 칸이고, 엔터는 `preventDefault` 로 막은 뒤 찾기를 부른다.
 *   jsdom 은 폼 제출을 흉내 내지 않아 단위에서는 이 차이를 잴 수 없다(쿠폰 폼에서 겪은 그 자리와 같다).
 * - **다시 찾아도 고른 사람은 남는다.** 검색 결과는 통째로 갈리므로, 고른 사람이 함께 사라지면 운영자는
 *   쿠폰이 누구에게 가는지 확인할 방법이 없다. 그건 돈이다.
 * - **이미 가진 사람은 건너뛴다**고 말한다. 두 번 눌러도 두 장이 되지 않는다.
 *
 * 받는 쪽 화면은 coupon-download 가 본다. 여기서는 **자기 손님**(couponGrantTarget)에게만 쥐어 주고,
 * 쿠폰은 매번 새로 만들어 최소 주문 금액을 터무니없게 잡고(다른 명세의 결제에 끼지 않게) 끝나면 중지한다.
 */

const TARGET_NAME = '쿠폰 지급 검사 손님';

test('쿠폰 지급 창구 — 엔터로 찾고, 고른 사람은 다시 찾아도 남고, 두 번 지급하면 건너뛴다', async ({ page }) => {
  test.setTimeout(90_000);

  const stamp = Date.now().toString(36).toUpperCase();
  const name = `지급검사 ${stamp}`;
  const created = await page.request.post('/api/admin/coupons', {
    data: {
      code: `GRT${stamp}`.slice(0, 20),
      name,
      kind: 'AMOUNT',
      value: 1000,
      minimumOrder: 10_000_000,
      issueLimit: 50,
      startsAt: new Date(Date.now() - 60_000).toISOString(),
      endsAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      downloadable: false,
    },
  });
  expect(created.status(), await created.text()).toBe(201);
  const { coupon } = (await created.json()) as { coupon: { id: string } };

  try {
    await page.goto('/admin/coupons');
    await ready(page);

    const row = page.getByRole('row').filter({ hasText: name });
    await expect(row.getByText('0 / 50')).toBeVisible();
    await row.getByRole('button', { name: `${name} 쿠폰 지급` }).click();

    const panel = page.getByRole('region', { name: `${name} 지급` });
    const search = panel.getByLabel('회원 검색');

    // ── 엔터로 찾는다. 화면이 넘어가지 않고, 찾기 창구로 그 말이 간다
    const at = page.url();
    const asked = page.waitForRequest((request) => request.url().includes('/api/admin/users/search'));
    await search.fill(SEED_ACCOUNT.couponGrantTarget);
    await search.press('Enter');
    expect(new URL((await asked).url()).searchParams.get('q')).toBe(SEED_ACCOUNT.couponGrantTarget);
    expect(page.url()).toBe(at);

    const pick = panel.getByRole('checkbox');
    await expect(pick).toHaveCount(1);
    await expect(panel.getByText(TARGET_NAME)).toBeVisible();

    // ── 고르면 "지급할 회원" 에 선다
    await pick.check();
    const picked = panel.getByRole('list', { name: '지급할 회원' });
    await expect(picked.getByRole('button', { name: `${TARGET_NAME} 빼기` })).toBeVisible();
    await expect(panel.getByRole('button', { name: '1명에게 지급' })).toBeEnabled();

    // ── 다시 찾으면 결과는 갈리지만 고른 사람은 남는다
    await search.fill('이런이름은없을것이다');
    await search.press('Enter');
    await expect(panel.getByText(/찾은 회원이 없습니다/)).toBeVisible();
    await expect(panel.getByRole('checkbox')).toHaveCount(0);
    await expect(picked.getByRole('button', { name: `${TARGET_NAME} 빼기` })).toBeVisible();

    // ── 빼면 지급할 수 없다
    await picked.getByRole('button', { name: `${TARGET_NAME} 빼기` }).click();
    await expect(panel.getByRole('list', { name: '지급할 회원' })).toHaveCount(0);
    await expect(panel.getByRole('button', { name: '0명에게 지급' })).toBeDisabled();

    // ── 다시 골라 지급한다
    await search.fill(SEED_ACCOUNT.couponGrantTarget);
    await search.press('Enter');
    await panel.getByRole('checkbox').check();
    await panel.getByRole('button', { name: '1명에게 지급' }).click();

    await expect(page.getByRole('region', { name: `${name} 지급` })).toHaveCount(0);
    await expect(page.getByText('1명에게 지급했습니다.')).toBeAttached();
    await expect(page.getByRole('row').filter({ hasText: name }).getByText('1 / 50'))
      .toBeVisible({ timeout: 20_000 });

    // ── 같은 사람에게 또 주면 건너뛴다고 말한다 — 두 번 눌러도 두 장이 되지 않는다
    await page.getByRole('row').filter({ hasText: name })
      .getByRole('button', { name: `${name} 쿠폰 지급` }).click();
    const again = page.getByRole('region', { name: `${name} 지급` });
    await again.getByLabel('회원 검색').fill(SEED_ACCOUNT.couponGrantTarget);
    await again.getByLabel('회원 검색').press('Enter');
    await again.getByRole('checkbox').check();
    await again.getByRole('button', { name: '1명에게 지급' }).click();

    await expect(page.getByText('1명은 이미 갖고 있어 건너뛰었습니다.', { exact: false })).toBeAttached();
    await expect(page.getByRole('row').filter({ hasText: name }).getByText('1 / 50')).toBeVisible();
  } finally {
    await page.request.patch(`/api/admin/coupons/${coupon.id}`, {
      data: { isActive: false },
      failOnStatusCode: false,
    });
  }
});
