import { test, expect } from '@playwright/test';
import { layoutTests } from './layout';

/**
 * 로그인해야 보이는 화면의 자리.
 *
 * 주문 목록의 탭이 실기기에서 세로로 쌓였는데, 손님 화면만 재고 있었다면
 * 영영 못 봤을 자리다. 탭은 상태가 늘어날수록 좁아지므로 특히 그렇다.
 */
layoutTests(test, expect, [
  ['주문 목록', '/mypage/orders'],
  ['마이페이지', '/mypage'],
  ['주소록', '/mypage/addresses'],
  ['쿠폰함', '/mypage/coupons'],
  ['포인트', '/mypage/points'],
  ['찜', '/mypage/wishlist'],
  ['알림', '/mypage/notifications'],
  ['문의', '/mypage/inquiries'],
  ['내 리뷰', '/mypage/reviews'],
  ['재입고 알림', '/mypage/restock'],
  ['탈퇴', '/mypage/close'],
  // 담긴 것이 없으면 빈 화면이지만, 빈 화면도 무너질 수 있다
  ['결제', '/checkout'],
]);
