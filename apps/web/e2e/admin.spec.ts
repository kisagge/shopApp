import { test, expect } from '@playwright/test';
import { ready } from './state';

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
    await ready(page);
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
    await ready(page);

    await page.getByRole('link', { name: '결제완료' }).click();

    // 하나라도 빠뜨리면 탭을 누르는 순간 조건이 풀린다
    await expect(page).toHaveURL(/q=/);
    await expect(page).toHaveURL(/status=PAID/);
  });

  test('조건 지우기로 되돌린다', async ({ page }) => {
    await page.goto('/admin/orders?q=데모&from=2026-01-01');
    await ready(page);

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

test('리뷰 관리는 대기줄을 먼저 보여 준다', async ({ page }) => {
  await page.goto('/admin/reviews');

  await expect(page.getByRole('heading', { name: '리뷰 관리', level: 1 })).toBeVisible();

  // 기본 탭은 "처리 대기" 다. 이 화면은 목록이 아니라 처리할 일감이다.
  await expect(page.getByRole('link', { name: /처리 대기/ })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('모르는 탭은 대기줄로 되돌린다', async ({ page }) => {
  // 주소에 아무 값이나 들어올 수 있다
  await page.goto('/admin/reviews?tab=%27%20OR%201%3D1');

  await expect(page.getByRole('link', { name: /처리 대기/ })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('내려간 글 탭은 되돌릴 수 있는 자리를 준다', async ({ page }) => {
  await page.goto('/admin/reviews?tab=removed');

  await expect(page.getByRole('link', { name: '내려간 글' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('상품 관리에 검수 대기줄이 있다', async ({ page }) => {
  await page.goto('/admin/products?status=PENDING_REVIEW');

  await expect(page.getByRole('link', { name: /검수 대기/ })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('운영진은 판매 상태를 모두 고를 수 있다', async ({ page }) => {
  await page.goto('/admin/products/new');

  const status = page.getByLabel('판매 상태');
  await expect(status.getByRole('option', { name: '판매중' })).toHaveCount(1);
  await expect(page.getByText(/운영진이 확인한 뒤에 됩니다/)).toHaveCount(0);
});

test('손님 화면에서 관리자 페이지로 가는 문이 보인다', async ({ page }) => {
  /*
   * 주소를 외워 쳐야만 들어갈 수 있으면 없는 것과 같다. 실제로 한동안
   * 그랬다 — 어느 손님 화면에도 /admin 으로 가는 링크가 없었다.
   */
  await page.goto('/');

  // 헤더와 모바일 메뉴에 하나씩 있고, 폭에 따라 한쪽만 보인다
  const door = page.locator('header a[href="/admin"]:visible');
  await expect(door).toHaveCount(1);

  await door.click();
  await expect(page.getByRole('heading', { name: '대시보드', level: 1 })).toBeVisible();
});

test('트래픽 화면이 실사용자 성능을 기준선과 함께 보여 준다', async ({ page }) => {
  // 숫자만 보여 주면 그게 좋은 값인지 알 수 없다
  await page.goto('/admin/traffic');
  await expect(page.getByRole('heading', { name: '실사용자 성능' })).toBeVisible();

  for (const metric of ['LCP', 'INP', 'CLS']) {
    await expect(page.locator('#main')).toContainText(metric);
  }
  // 색만으로 좋고 나쁨을 말하지 않는다
  await expect(page.locator('#main')).toContainText(/좋음|개선 필요|나쁨|표본 없음/);
});

test('기획전에 담을 상품을 같은 창구로 찾는다', async ({ page }) => {
  /*
   * 쿠폰 대상 지정과 기획전 담기가 하던 일이 같아서 창구를 하나로 합쳤다.
   * 합치면서 한쪽이 조용히 죽을 수 있는 자리라 양쪽을 다 밟아 둔다.
   */
  await page.goto('/admin/collections');
  const picker = page.locator('section[aria-label="담긴 상품"]').first();

  await picker.getByLabel('상품 찾기').fill('코트');
  await picker.getByRole('button', { name: '찾기' }).click();

  await expect(picker.getByRole('button', { name: /담기|담김/ }).first()).toBeVisible();
});

test('쿠폰 대상도 같은 창구를 쓴다', async ({ page }) => {
  await page.goto('/admin/coupons');
  await ready(page);
  // 대상 지정 칸은 새 쿠폰을 만들 때만 나온다
  await page.getByRole('button', { name: '새 쿠폰 만들기' }).click();

  // 헤더에도 "상품 검색" 이 있다 — id 로 정확히 집는다
  await page.locator('#product-q').fill('코트');
  await page.locator('#product-q').press('Enter');

  // 찾은 것이 하나라도 떠야 대상 지정을 할 수 있다. 결과는 체크박스로 나온다.
  await expect(page.getByRole('checkbox', { name: /코트/ }).first()).toBeVisible();
});
