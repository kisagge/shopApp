import { test, expect } from '@playwright/test';
import { SEED_ACCOUNT } from '@shop/auth/seed-fixtures';
import { ready } from './state';

/**
 * 운영 회원 표에서 이름을 누르면 한 사람의 요약이 나오고, 거기서 주문·포인트 화면으로 이어진다.
 *
 * 무엇을 모으는지는 단위 검사가 본다. 여기서 보는 것은 **길이 이어지는가**와 **숫자가 다른 화면과 같은가**다 — 목록의
 * 잔액과 상세의 잔액, 상세의 주문번호와 주문 화면의 주문번호.
 *
 * 읽기만 한다. 시드 손님(demo)을 쓰고, 그 사람의 데이터를 바꾸지 않는다. 막힌 상태가 위에 서는 것은 이용 정지 명세가
 * 정지한 채로 본다.
 */

const EMAIL = SEED_ACCOUNT.customer;

test('이름을 누르면 회원 상세가 열리고, 잔액은 목록과 같고, 최근 주문과 포인트 화면으로 이어진다', async ({ page }) => {
  test.setTimeout(60_000);

  await page.goto(`/admin/users?q=${encodeURIComponent(EMAIL)}`);
  await ready(page);
  const row = page.getByRole('row').filter({ hasText: EMAIL });
  await expect(row).toHaveCount(1);
  const listBalance = (await row.getByRole('link', { name: /포인트 [\d,]+P$/ }).textContent())!.trim();
  const nameLink = row.getByRole('link').first();
  const name = (await nameLink.textContent())!.trim();

  await nameLink.click();
  await page.waitForURL(/\/admin\/users\/[^/]+$/);
  await ready(page);

  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  await expect(page.getByRole('region', { name: '기본 정보' })).toContainText(EMAIL);
  // 목록과 상세가 같은 잔액을 말한다
  const points = page.getByRole('region', { name: '포인트' });
  await expect(points).toContainText(listBalance);

  // ── 최근 주문에서 주문 화면으로 — 같은 주문번호가 열린다
  const orders = page.getByRole('region', { name: '최근 주문 목록' });
  if (await orders.count()) {
    const first = orders.getByRole('link').first();
    const orderNo = (await first.textContent())!.trim();
    await first.click();
    await page.waitForURL(new RegExp(`/admin/orders/${orderNo}$`));
    await ready(page);
    await expect(page.getByRole('heading', { level: 1, name: '주문 상세' })).toBeVisible();
    await expect(page.getByText(orderNo, { exact: true }).first()).toBeVisible();
    await page.goBack();
    await ready(page);
  }

  // ── 포인트 화면으로 — 같은 잔액
  await page.getByRole('region', { name: '포인트' }).getByRole('link').click();
  await page.waitForURL(/\/admin\/users\/[^/]+\/points$/);
  await ready(page);
  await expect(page.getByRole('heading', { level: 1, name: `${name} 포인트` })).toBeVisible();
  await expect(page.getByText(listBalance).first()).toBeVisible();
});
