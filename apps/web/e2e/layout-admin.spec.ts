import { test, expect } from '@playwright/test';
import { layoutTests, ADMIN_WIDTHS } from './layout';

/**
 * 운영 화면의 자리.
 *
 * 손님 화면만 재고 있었다. 운영 화면은 표가 빽빽해서 오히려 더 잘 무너지는데,
 * 매일 열어 보는 사람이 있는 화면이라 무너지면 바로 일이 막힌다.
 */
layoutTests(test, expect, [
  ['대시보드', '/admin'],
  ['주문', '/admin/orders'],
  ['상품', '/admin/products'],
  ['상품 등록', '/admin/products/new'],
  ['정산', '/admin/settlements'],
  ['회원', '/admin/users'],
  ['가맹점', '/admin/merchants'],
  ['쿠폰', '/admin/coupons'],
  ['배너', '/admin/banners'],
  ['기획전', '/admin/collections'],
  ['리뷰 신고', '/admin/reviews'],
  ['문의', '/admin/inquiries'],
  ['고객센터 글', '/admin/support'],
  ['포인트', '/admin/points'],
  ['트래픽', '/admin/traffic'],
  ['감사 로그', '/admin/audit'],
], ADMIN_WIDTHS);
