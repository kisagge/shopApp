import { test } from '@playwright/test';
import { expectNoA11yViolations } from './axe';

/**
 * 운영진이 쓰는 화면.
 *
 * **손님 화면만 지키는 것은 절반이다.** 어드민은 매일 몇 시간씩 쓰는
 * 자리이고, 표와 폼이 가장 빽빽한 곳이다. 여기서 이름표가 어긋나면
 * 그 대가를 매일 치른다.
 */

const PAGES: readonly (readonly [string, string])[] = [
  ['대시보드', '/admin'],
  ['트래픽', '/admin/traffic'],
  ['주문', '/admin/orders'],
  ['반품·교환', '/admin/returns'],
  ['상품', '/admin/products'],
  ['상품 보관함', '/admin/products?view=archived'],
  ['배너', '/admin/banners'],
  ['기획전', '/admin/collections'],
  ['쿠폰', '/admin/coupons'],
  ['리뷰', '/admin/reviews'],
  ['문의', '/admin/inquiries'],
  ['공지·FAQ', '/admin/support'],
  ['약관·방침', '/admin/policies'],
  ['배송비', '/admin/shipping'],
  ['알림 문구', '/admin/notification-templates'],
  ['메일 문구', '/admin/mail-templates'],
  ['알림', '/admin/notifications'],
  ['정산', '/admin/settlements'],
  ['가맹점', '/admin/merchants'],
  ['회원', '/admin/users'],
  ['포인트 대사', '/admin/points'],
  ['감사 로그', '/admin/audit'],
  ['오류', '/admin/errors'],
  ['상품 등록', '/admin/products/new'],
];

for (const [name, path] of PAGES) {
  test(`${name} 화면에 접근성 위반이 없다`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await expectNoA11yViolations(page);
  });
}

/**
 * 동적 경로.
 *
 * 목록만 훑으면 **상세는 한 번도 안 지나간다.** 실제로 운영자가 오래 머무는
 * 자리는 목록이 아니라 상세다 — 주문 하나를 붙들고 상태를 바꾸고 메모를 쓴다.
 */
for (const [name, list, link] of [
  ['주문 상세', '/admin/orders', 'a[href^="/admin/orders/"]'],
  ['상품 수정', '/admin/products', 'a[href^="/admin/products/"]'],
  ['회원 상세', '/admin/users', 'a[href^="/admin/users/"]:not([href$="/points"])'],
  ['회원 포인트', '/admin/users', 'a[href$="/points"]'],
  // 신청서·지난 기록이 설명 목록과 목록으로 선다. 하위 화면과 안 겹치게 id 로 끝나는 링크만.
  ['가맹점 상세', '/admin/merchants', 'a[href^="/admin/merchants/"]:not([href$="/return-address"]):not([href$="/settings"])'],
  ['가맹점 반품지', '/admin/merchants', 'a[href$="/return-address"]'],
  ['가맹점 정보', '/admin/merchants', 'a[href$="/settings"]'],
] as const) {
  test(`${name} 화면에 접근성 위반이 없다`, async ({ page }) => {
    await page.goto(list);
    await page.waitForLoadState('networkidle');

    // 주소를 박아 두면 시드가 바뀔 때 조용히 다른 것을 보게 된다
    const first = page.locator(`#main ${link}`).first();
    test.skip((await first.count()) === 0, '목록이 비어 있다');
    await first.click();
    await page.waitForLoadState('networkidle');

    await expectNoA11yViolations(page);
  });
}
