import { test, expect } from '@playwright/test';

/** 운영자가 보는 화면 */

test('대시보드가 열린다', async ({ page }) => {
  await page.goto('/admin');

  await expect(page.getByRole('heading', { name: '대시보드', level: 1 })).toBeVisible();
});

test('기간을 바꾸면 라벨도 따라간다', async ({ page }) => {
  await page.goto('/admin?range=90d');

  // 데이터는 기간을 따라가는데 설명만 "최근 7일" 로 고정돼 있던 적이 있다.
  // 90일치 숫자를 7일치라고 읽게 된다.
  await expect(page.locator('#main')).toContainText('최근 90일');
  await expect(page.locator('#main')).not.toContainText('최근 7일');
});

test('모르는 기간은 기본값으로 되돌린다', async ({ page }) => {
  // 주소에 아무 값이나 들어올 수 있다. 오류를 내면 링크를 잘못 눌렀을 뿐인
  // 사람에게 빈 화면을 보여 주게 된다.
  await page.goto('/admin?range=%271%20OR%201%3D1');

  await expect(page.getByRole('heading', { name: '대시보드', level: 1 })).toBeVisible();
  await expect(page.locator('#main')).toContainText('최근 7일');
});

test('트래픽 화면이 세션 기준이 아니라고 밝힌다', async ({ page }) => {
  await page.goto('/admin/traffic');

  // 하루 단위로 접은 세션 수는 달 단위로 더할 수 없다. 그 사실을 화면이
  // 말하지 않으면 보는 사람이 세션 기준으로 읽는다.
  await expect(page.locator('#main')).toContainText('이벤트 수 기준');
});

test('쿠폰 발행 폼이 열린다', async ({ page }) => {
  await page.goto('/admin/coupons');

  const create = page.getByRole('button', { name: '새 쿠폰 만들기' });
  if ((await create.count()) > 0) await create.click();

  await expect(page.getByLabel('코드')).toBeVisible();
  // 대상을 고르지 않으면 전체라는 사실이 화면에 있어야 한다
  await expect(page.locator('#main')).toContainText('모든 상품');
});

/**
 * 주문 검색.
 *
 * 문의가 들어오면 운영자가 가장 먼저 하는 일이 주문번호로 찾는 것이다.
 * 그동안은 상태 탭만 있어서 넘겨 가며 눈으로 찾아야 했다.
 */
test.describe('주문 검색', () => {
  test('주문번호로 그 주문만 찾는다', async ({ page }) => {
    await page.goto('/admin/orders');

    // 목록의 첫 주문번호를 그대로 검색어로 쓴다 — 시드가 바뀌어도 깨지지 않는다
    const first = page.locator('tbody tr td:first-child a').first();
    const orderNo = (await first.innerText()).trim();

    await page.getByLabel('주문번호 · 주문자').fill(orderNo);
    await page.getByRole('button', { name: '검색' }).click();

    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(page.locator('tbody tr td:first-child')).toContainText(orderNo);
  });

  test('조건이 주소에 남는다 — 새로고침해도 같은 결과다', async ({ page }) => {
    await page.goto('/admin/orders');
    await page.getByLabel('주문번호 · 주문자').fill('데모');
    await page.getByRole('button', { name: '검색' }).click();

    await expect(page).toHaveURL(/[?&]q=/);
    const before = await page.locator('tbody tr').count();

    await page.reload();
    expect(await page.locator('tbody tr').count()).toBe(before);
  });

  test('없는 이름은 다음 행동을 알려 준다', async ({ page }) => {
    await page.goto('/admin/orders?q=존재하지않는주문자입니다');

    // 검색어만 되뇌지 않고 무엇을 바꿔야 하는지 말해 준다
    await expect(page.locator('#main')).toContainText(/검색어나 기간/);
  });

  test('상태 탭을 눌러도 검색이 유지된다', async ({ page }) => {
    await page.goto('/admin/orders?q=데모');

    await page.getByRole('link', { name: '결제완료' }).click();

    // 하나라도 빠뜨리면 탭을 누르는 순간 조건이 풀린다
    await expect(page).toHaveURL(/q=/);
    await expect(page).toHaveURL(/status=PAID/);
  });

  test('조건 지우기로 되돌린다', async ({ page }) => {
    await page.goto('/admin/orders?q=데모&from=2026-01-01');

    await page.getByRole('link', { name: '조건 지우기' }).click();

    await expect(page).not.toHaveURL(/q=/);
    await expect(page).not.toHaveURL(/from=/);
  });

  test('잘못된 날짜는 빈 화면 대신 이유를 말한다', async ({ page }) => {
    // 주소를 손으로 고치다 형식이 깨지면, 주문이 없는 것인지 조건이 틀린
    // 것인지 알 수 없는 빈 화면이 가장 나쁘다
    await page.goto('/admin/orders?from=2026-02-31');

    await expect(page.locator('#main').getByRole('alert')).toContainText(/날짜/);
    await expect(page.locator('tbody tr').first()).toBeVisible();
  });
});
