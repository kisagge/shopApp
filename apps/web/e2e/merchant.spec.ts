import { test, expect } from '@playwright/test';
import { ready } from './state';

/** 가맹점은 자기 것만 본다 */

test('가맹점도 어드민에는 들어간다', async ({ page }) => {
  await page.goto('/admin');

  await expect(page.getByRole('heading', { name: '대시보드', level: 1 })).toBeVisible();
});

test('감사 로그는 메뉴에도 없고 주소로도 못 간다', async ({ page }) => {
  await page.goto('/admin');

  // 감사 로그는 운영진을 감시하는 도구다
  await expect(page.getByRole('link', { name: '감사 로그' })).toHaveCount(0);

  // 메뉴를 감추는 것만으로는 부족하다. 주소를 직접 쳐도 막혀야 한다.
  await page.goto('/admin/audit');
  expect(new URL(page.url()).pathname).not.toBe('/admin/audit');
});

test('쿠폰은 플랫폼 비용이라 가맹점이 만들지 않는다', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.getByRole('link', { name: '쿠폰' })).toHaveCount(0);

  await page.goto('/admin/coupons');
  expect(new URL(page.url()).pathname).not.toBe('/admin/coupons');
});

test('가맹점은 자기 상품의 평을 읽되 내리지는 못한다', async ({ page }) => {
  /*
   * **한동안 아예 못 들어왔다.** 그때 여기 적어 둔 이유는 "자기 상품의 혹평을
   * 내릴 수 있으면 리뷰가 상품 설명의 일부가 된다" 였고, 그 판단은 지금도
   * 맞다. 다만 그 이유는 **내리는 것**에 걸리는 말이지 읽는 것에 걸리는 말이
   * 아니었다 — 파는 사람이 자기 물건 평을 못 보면 고칠 수가 없고, 문의는
   * 답까지 하게 해 두었으면서 리뷰만 가려 둔 셈이었다.
   *
   * 그래서 읽기(`review:read`)와 내리기(`review:moderate`)를 갈랐다.
   */
  await page.goto('/admin/reviews');
  await expect(page.getByRole('heading', { name: '리뷰 관리', level: 1 })).toBeVisible();

  // 내리기·되살리기 단추가 한 개도 서면 안 된다
  await expect(page.getByRole('button', { name: /내리기|되살리기/ })).toHaveCount(0);

  /*
   * **처리 대기 탭도 없다.** 내릴 수 없는 사람에게 신고 대기줄을 보여 주면
   * 할 일처럼 보이는데 할 수 있는 것이 없다.
   */
  await expect(page.getByRole('link', { name: /처리 대기/ })).toHaveCount(0);
});

test('리뷰를 내리는 창구는 가맹점에게 닫혀 있다', async ({ page }) => {
  /*
   * **화면이 단추를 감추는 것과 서버가 막는 것은 다른 일이다.** 앞엣것만
   * 있으면 주소를 아는 사람이 그냥 부르면 된다. 리뷰 목록이 열린 지금은
   * 리뷰 id 도 화면에 있으므로 더 그렇다.
   */
  for (const path of ['dismiss', 'restore']) {
    const res = await page.request.post(`/api/admin/reviews/does-not-exist/${path}`, {
      data: { note: null },
      failOnStatusCode: false,
    });
    expect(res.status(), `${path} 가 가맹점에게 열려 있다`).toBe(403);
  }
});

test('가맹점이 보는 리뷰는 자기 상품 것뿐이다', async ({ page }) => {
  /*
   * **권한을 낮추는 것만으로는 부족하다.** 범위를 함께 좁히지 않으면 가맹점이
   * 남의 브랜드에 달린 평까지 본다 — 경쟁사의 약점을 우리가 떠먹여 주는 셈이다.
   */
  await page.goto('/admin/reviews?tab=all');
  await expect(page.getByRole('heading', { name: '리뷰 관리', level: 1 })).toBeVisible();

  /*
   * 리뷰 줄은 상품 이름을 운영 상품 화면으로 걸어 둔다. 그 주소를 그대로
   * 들고 가서 **상품 쪽에서 브랜드를 읽는다** — 리뷰 목록에는 브랜드가 안
   * 적히므로 여기서 눈으로 가릴 방법이 없다.
   */
  const links = page.locator('#main a[href^="/admin/products/"]');
  const count = await links.count();
  expect(count, '리뷰가 한 건도 없어 범위를 확인할 수 없다').toBeGreaterThan(0);

  const hrefs = new Set<string>();
  for (let i = 0; i < count; i += 1) {
    const href = await links.nth(i).getAttribute('href');
    if (href) hrefs.add(href);
  }

  /*
   * **남의 상품이면 그 상품 화면이 우리를 막는다.** 운영 상품 화면은 이미
   * 가맹점 범위를 걸고 있으므로, 리뷰 목록이 샜다면 여기서 못 열린다.
   * 리뷰 쪽 범위와 상품 쪽 범위를 맞대 보는 셈이다.
   */
  for (const href of hrefs) {
    /*
     * **주소가 아니라 상태 코드를 본다.** 남의 상품이면 404 가 오는데 주소는
     * 그대로 남는다 — 처음에 주소만 견주어서, 범위를 통째로 걷어 내고도
     * 검사가 통과했다.
     */
    const response = await page.goto(href);
    expect(response?.status(), `${href} 는 이 가맹점 것이 아니다`).toBe(200);
  }
});

test('가맹점은 상품을 스스로 매대에 올릴 수 없다', async ({ page }) => {
  /*
   * product:publish 를 만들어 두고 어디서도 검사하지 않았다. 게다가 가맹점도
   * 그 권한을 갖고 있어서, 검사를 넣어도 아무것도 달라지지 않았다.
   */
  await page.goto('/admin/products/new');

  const status = page.getByLabel('판매 상태');
  await expect(status.getByRole('option', { name: '판매중' })).toHaveCount(0);
  await expect(status.getByRole('option', { name: '품절' })).toHaveCount(0);

  // 대신 요청할 길은 있어야 한다. 없으면 작성만 하고 끝난다.
  await expect(status.getByRole('option', { name: '검수 대기' })).toHaveCount(1);
  await expect(page.getByText(/운영진이 확인한 뒤에 됩니다/)).toBeVisible();
});

test('이미 가맹점이면 신청 화면이 아니라 어드민으로 간다', async ({ page }) => {
  // 여기서 할 수 있는 일이 없는데 화면만 띄우면 막다른 길이 된다
  await page.goto('/merchant/apply');
  expect(new URL(page.url()).pathname).toBe('/admin');
});

test('가맹점은 문의 대기줄을 본다', async ({ page }) => {
  // 자기 상품 문의는 파는 사람이 답하는 것이 맞다
  await page.goto('/admin');
  await expect(page.getByRole('link', { name: '문의' })).toBeVisible();

  await page.goto('/admin/inquiries');
  await expect(page.getByRole('heading', { name: '상품 문의', level: 1 })).toBeVisible();
  // 남의 상품 문의가 섞이면 할 일 목록이 되지 않는다
  await expect(page.getByText('내 브랜드만')).toBeVisible();
});

test('가맹점도 자기 상품의 전환을 본다', async ({ page }) => {
  /*
   * **한동안 아예 안 보여 줬다.** 자기 물건이 몇 번 조회되고 몇 번 담기는지
   * 모르면 무엇을 고쳐야 할지도 알 수 없다. 그 뿌리는 더 아래에 있었다 —
   * 이벤트의 가맹점 칸이 한 번도 안 채워져서(개발 DB 1만 7천 건 중 0건)
   * 가맹점별로 셀 수가 없었다.
   */
  await page.goto('/admin');
  await ready(page);

  const funnel = page.getByRole('region', { name: '구매 퍼널' });
  await expect(funnel, '가맹점에게 퍼널이 없다').toBeVisible();

  /*
   * **네 칸이 아니라 세 칸이다.** 주문서 진입은 장바구니 전체의 일이라 한
   * 가맹점에 귀속되지 않는다 — 그 사실을 화면이 말해야 한다. 아무 말 없이
   * 하나 적으면 빠진 것처럼 보인다.
   */
  const steps = funnel.getByRole('listitem');
  await expect(steps).toHaveCount(3);

  /*
   * **칸 목록에서 찾는다.** 안내 문구에도 "주문서 진입" 이 들어 있어서
   * 구역 전체 글자로 보면 늘 걸린다 — 처음에 그렇게 짜서 멀쩡한 화면을
   * 틀렸다고 읽었다. 빠졌다는 것은 **단계 칸에 없다**는 뜻이다.
   */
  await expect(steps).toContainText(['상품 조회', '장바구니 담기', '결제 완료']);
  await expect(funnel, '왜 세 칸인지 말해 주지 않는다').toContainText('내 상품 기준');
});

test('가맹점은 자기 반품지만 고친다 — 남의 반품지는 주소로도 못 연다', async ({ page }) => {
  /*
   * **반품 물건을 받는 곳은 가맹점 창고다.** 그래서 그 주소는 가맹점이 직접 쥔다. 대신 남의 것을 고칠 수 있으면
   * 그 가게로 갈 물건을 자기 창고로 돌릴 수 있다 — 목록에도 자기 줄만 있고, 주소를 직접 쳐도 막혀야 한다.
   */
  await page.goto('/admin/merchants');
  await ready(page);

  const rows = page.getByRole('row').filter({ has: page.getByRole('link', { name: /반품지/ }) });
  await expect(rows, '남의 가맹점 반품지 링크가 보인다').toHaveCount(1);

  await rows.getByRole('link', { name: /반품지/ }).click();
  await page.waitForURL(/\/admin\/merchants\/[^/]+\/return-address$/);
  await ready(page);
  await expect(page.getByRole('heading', { name: '스튜디오눈 반품지', level: 1 })).toBeVisible();

  const mine = new URL(page.url()).pathname.split('/')[3]!;
  const other = await page.request.put(`/api/admin/return-addresses/${mine}-not-mine`, {
    data: { recipient: '내 창고', phone: '010-0000-0000', postalCode: '04799', address1: '서울 성동구 성수이로 00' },
    failOnStatusCode: false,
  });
  expect(other.status(), '남의 반품지를 고칠 수 있다').toBe(403);

  // 자사 상품 반품지는 배송 정책이라 가맹점 몫이 아니다
  const platform = await page.request.put('/api/admin/return-addresses/platform', {
    data: { recipient: '내 창고', phone: '010-0000-0000', postalCode: '04799', address1: '서울 성동구 성수이로 00' },
    failOnStatusCode: false,
  });
  expect(platform.status(), '가맹점이 자사 상품 반품지를 고칠 수 있다').toBe(403);
});
