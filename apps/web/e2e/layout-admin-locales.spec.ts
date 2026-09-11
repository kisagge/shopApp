import { test, expect } from '@playwright/test';
import { layoutTests, ADMIN_WIDTHS } from './layout';
import { STATE_FILE } from './state';

/**
 * 운영 화면을 **한국어가 아닌 말로도** 재다.
 *
 * 손님 화면을 en·ja 로 켰더니 일본어 상품 상세가 320px 에서 가로로 밀리는
 * 것이 나왔다 — 한국어로는 깨끗해서 아무도 몰랐다. 운영 화면은 표가 빽빽해서
 * 글자가 길어지면 더 잘 무너진다.
 *
 * **폭은 768 부터다.** 운영 화면은 애초에 좁은 화면을 겨냥하지 않는다
 * (`ADMIN_WIDTHS`). 320px 에서 표가 넘치는 것은 무너진 것이 아니라 원래
 * 그렇게 만든 것이다 — 표마다 `overflow-x-auto` 로 자기 안에서 밀리게 해 뒀다.
 *
 * 상세 화면은 넣지 않는다. 목록에서 첫 줄을 눌러 들어가는데, 말을 바꿔 두 번
 * 돌면 같은 자료를 두 번 밟는다. 상세의 자리는 `layout-admin.spec.ts` 가
 * 한국어로 이미 보고 있고, 넘침은 말이 길어져서 생기지 자료가 있어서 생기지
 * 않는다.
 */

test.use({ storageState: STATE_FILE.admin });

const PAGES = [
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
] as const;

/**
 * **재려던 화면을 재고 있는지 한 번 못 박는다.**
 *
 * 권한이 없으면 운영 화면은 다른 곳으로 보내고, 그 화면은 단순해서 안
 * 무너진다 — 위 검사가 전부 통과하면서 정작 재려던 표는 한 번도 안 본
 * 상태가 될 수 있다. 손님 쪽과 같은 이유로 두되, 같은 단서도 함께 적어 둔다:
 * 그런 경우를 실제로 만들어 보지는 못했다.
 */
test('운영자로 재고 있다', async ({ page }) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin$/);
});

test.describe('영어', () => {
  test.use({ locale: 'en-US' });
  layoutTests(test, expect, PAGES, ADMIN_WIDTHS);
});

test.describe('일본어', () => {
  test.use({ locale: 'ja-JP' });
  layoutTests(test, expect, PAGES, ADMIN_WIDTHS);
});
