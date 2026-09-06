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
  ['상품', '/admin/products'],
  ['배너', '/admin/banners'],
  ['기획전', '/admin/collections'],
  ['쿠폰', '/admin/coupons'],
  ['리뷰', '/admin/reviews'],
  ['문의', '/admin/inquiries'],
  ['공지·FAQ', '/admin/support'],
  ['정산', '/admin/settlements'],
  ['가맹점', '/admin/merchants'],
  ['회원', '/admin/users'],
  ['포인트 대사', '/admin/points'],
  ['감사 로그', '/admin/audit'],
];

for (const [name, path] of PAGES) {
  test(`${name} 화면에 접근성 위반이 없다`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await expectNoA11yViolations(page);
  });
}
