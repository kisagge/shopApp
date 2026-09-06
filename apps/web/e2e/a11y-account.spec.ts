import { test } from '@playwright/test';
import { expectNoA11yViolations } from './axe';
import { ready } from './state';

/**
 * 로그인한 사람이 보는 화면.
 *
 * 손님 화면과 달리 **여기는 사람이 자기 정보를 다루는 자리**다 — 주소를
 * 고치고, 주문을 취소하고, 리뷰를 쓴다. 폼이 많은 만큼 이름표·오류 연결이
 * 어긋날 자리도 많다.
 */

const PAGES: readonly (readonly [string, string])[] = [
  ['마이페이지', '/mypage'],
  ['주문 내역', '/mypage/orders'],
  ['배송지', '/mypage/addresses'],
  ['찜', '/mypage/wishlist'],
  ['포인트', '/mypage/points'],
  ['쿠폰함', '/mypage/coupons'],
  ['내 리뷰', '/mypage/reviews'],
  ['내 문의', '/mypage/inquiries'],
  ['알림', '/mypage/notifications'],
  ['재입고 알림', '/mypage/restock'],
];

for (const [name, path] of PAGES) {
  test(`${name} 화면에 접근성 위반이 없다`, async ({ page }) => {
    await page.goto(path);
    await ready(page);
    await expectNoA11yViolations(page);
  });
}
