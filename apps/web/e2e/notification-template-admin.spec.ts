import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { STATE_FILE, ready } from './state';

/**
 * 운영진이 알림 문구를 고치면 손님 알림함이 그 말로 읽고, 되돌리면 기본 문구로 돌아온다.
 *
 * 저장 규칙과 값 끼우기는 단위 검사가 본다. 여기서 보는 것은 **고친 문구가 실제 알림에 닿는가**다. 알림은 스스로
 * 만든다 — 쿠폰을 하나 만들어 한 손님에게 지급한다(쿠폰 지급 알림). 쿠폰은 최소 주문 금액을 끝없이 높게 잡아
 * 그 손님의 다른 검사(주문 검색)가 결제에서 이 쿠폰을 만나도 붙지 않게 한다.
 *
 * 템플릿은 가게 전체의 값이라 **끝나면 반드시 되돌린다** — 다른 명세가 쿠폰 알림 문구를 읽을 수 있다.
 */

test.describe.configure({ mode: 'serial' });

const CUSTOM = '{couponName} 받아 가세요 — 문구 검사';

async function resetTemplate(request: APIRequestContext): Promise<void> {
  await request.patch('/api/admin/notification-templates', {
    data: { kind: 'COUPON_ISSUED', locale: 'ko', body: null },
    failOnStatusCode: false,
  });
}

function couponSection(page: Page) {
  return page.getByRole('region', { name: /쿠폰 지급/ });
}

test('쿠폰 지급 문구를 고치면 손님 알림이 새 말로 뜨고, 되돌리면 기본 문구로 돌아온다', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const customer = await browser.newContext({ storageState: STATE_FILE.orderSearch });

  try {
    const session = await customer.request.get('/api/auth/get-session');
    const userId = ((await session.json()) as { user: { id: string } }).user.id;

    // ── 운영: 틀린 값은 저장 전에 막히고, 고친 문구는 미리 보고 저장한다
    await page.goto('/admin/notification-templates?locale=ko');
    await ready(page);
    await expect(page.getByRole('link', { name: '한국어' })).toHaveAttribute('aria-current', 'page');
    const section = couponSection(page);
    const box = section.getByLabel('문구');

    await box.fill('{orderNo} 쿠폰');
    await expect(box).toHaveAttribute('aria-invalid', 'true');
    await expect(section.getByText('이 알림에 없는 값입니다: {orderNo}')).toBeVisible();
    await expect(section.getByRole('button', { name: '저장' })).toBeDisabled();

    await box.fill(CUSTOM);
    await expect(section.getByRole('status', { name: '미리보기 (예시 값)' })).toHaveText('가을 10% 쿠폰 받아 가세요 — 문구 검사');
    await section.getByRole('button', { name: '저장' }).click();
    await expect(section.getByText('저장했습니다.')).toBeVisible({ timeout: 15_000 });
    await expect(section.getByText(/고친 문구/)).toBeVisible();

    // ── 알림을 만든다: 쿠폰 하나를 그 손님에게
    const name = `문구검사 ${Date.now().toString(36)}`;
    const created = await page.request.post('/api/admin/coupons', {
      data: {
        code: `TPL${Date.now().toString(36).toUpperCase()}`.slice(0, 20),
        name,
        kind: 'AMOUNT',
        value: 1000,
        minimumOrder: 10_000_000,
        startsAt: new Date(Date.now() - 60_000).toISOString(),
        endsAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
    });
    expect(created.status(), await created.text()).toBe(201);
    const { coupon } = (await created.json()) as { coupon: { id: string } };
    const issued = await page.request.post(`/api/admin/coupons/${coupon.id}/issue`, { data: { userIds: [userId] } });
    expect(issued.ok(), await issued.text()).toBe(true);

    // ── 손님: 고친 문구로 읽힌다
    const cp = await customer.newPage();
    await cp.goto('/mypage/notifications');
    await ready(cp);
    const list = cp.getByRole('list', { name: '알림' });
    await expect(list.getByText(`${name} 받아 가세요 — 문구 검사`)).toBeVisible();

    // ── 운영: 기본 문구로 되돌리면 같은 알림이 기본 문구로 읽힌다(알림에는 문장이 아니라 값만 있다)
    await couponSection(page).getByRole('button', { name: '기본 문구로' }).click();
    await expect(couponSection(page).getByText('기본 문구로 되돌렸습니다.')).toBeVisible({ timeout: 15_000 });
    await cp.reload();
    await ready(cp);
    await expect(list.getByText(`${name} 쿠폰이 도착했습니다`)).toBeVisible();
    await expect(list.getByText(`${name} 받아 가세요 — 문구 검사`)).toHaveCount(0);
  } finally {
    await resetTemplate(page.request);
    await customer.close();
  }
});
