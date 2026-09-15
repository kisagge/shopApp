import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { layoutTests, ADMIN_WIDTHS } from './layout';

/**
 * 표의 첫 줄로 들어간다.
 *
 * **못 들어가면 진다.** 조용히 목록을 다시 재고 통과하면, 상세 화면을 재고
 * 있다고 믿는 검사가 사실은 목록을 두 번 재는 것이 된다 — 검사가 있다는
 * 사실이 오히려 해롭다.
 */
const openFirstRow = async (page: Page): Promise<void> => {
  const link = page.locator('table a[href]').first();
  await link.click();
  await page.waitForLoadState('domcontentloaded');
};

/** 회원 표에서 포인트 잔액 링크를 누른다 — 이름 링크가 먼저라 첫 링크로는 닿지 않는다 */
const openPointsLink = async (page: Page): Promise<void> => {
  await page.locator('table a[href$="/points"]').first().click();
  await page.waitForLoadState('domcontentloaded');
};

/**
 * 운영 화면의 자리.
 *
 * 손님 화면만 재고 있었다. 운영 화면은 표가 빽빽해서 오히려 더 잘 무너지는데,
 * 매일 열어 보는 사람이 있는 화면이라 무너지면 바로 일이 막힌다.
 */
/**
 * 공지 편집기의 링크 줄을 펼친다.
 *
 * **눌러야 나오는 것은 그냥 열어서는 없는 것이다.** 이 줄이 375px 에서 라벨과
 * 단추가 한 자씩 줄바꿈돼 세로로 서 있었는데, 화면을 열기만 하는 검사는 그것을
 * 한 번도 못 봤다. 접혀 있는 자리가 있으면 펼쳐 놓고 재야 한다.
 */
const openLinkRow = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: '링크' }).click();
  await page.getByRole('textbox', { name: '주소' }).waitFor();
};

layoutTests(test, expect, [
  ['대시보드', '/admin'],
  ['주문', '/admin/orders'],
  ['상품', '/admin/products'],
  ['상품 보관함', '/admin/products?view=archived'],
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
  ['배송비', '/admin/shipping'],
  ['알림 문구', '/admin/notification-templates'],
  ['메일 문구', '/admin/mail-templates'],
  ['알림', '/admin/notifications'],
  ['포인트', '/admin/points'],
  ['트래픽', '/admin/traffic'],
  ['감사 로그', '/admin/audit'],
  /*
   * 상세 화면은 목록과 마크업이 전혀 다르다 — 주문 상세는 처리 단추와 배송
   * 정보가, 상품 상세는 옵션·재고 표가 붙는다. 목록만 재면 못 보는 자리다.
   */
  ['주문 상세', '/admin/orders', openFirstRow],
  ['상품 상세', '/admin/products', openFirstRow],
  // 회원 표의 첫 링크는 이름 — 요약 칸들과 최근 주문 표가 두 줄로 선다
  ['회원 상세', '/admin/users', openFirstRow],
  // 원장 표와 조정 폼이 나란히 선다
  ['회원 포인트', '/admin/users', openPointsLink],
  ['공지 편집기 — 링크 줄', '/admin/support', openLinkRow],
], ADMIN_WIDTHS);
