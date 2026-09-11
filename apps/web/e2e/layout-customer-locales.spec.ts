import { test, expect } from '@playwright/test';
import { layoutTests } from './layout';
import { STATE_FILE } from './state';

/**
 * 로그인해야 보이는 화면을 **한국어가 아닌 말로도** 재다.
 *
 * `layout.spec.ts` 를 en·ja 로 켰더니 일본어 상품 상세가 320px 에서 가로로
 * 밀리는 것이 나왔다 — 한국어로는 깨끗해서 아무도 몰랐다. 로그인 화면도
 * 같은 이유로 열어 둔다. 마이페이지는 탭과 표가 많아 글자가 길어지면 먼저
 * 티가 나는 자리다.
 *
 * **장바구니를 쓰는 화면은 넣지 않는다.** 결제·주문 상세는 자료를 만들고
 * 되돌려야 하는데, 계정의 서버 장바구니는 하나뿐이라 같은 계정으로 말만 바꿔
 * 두 번 돌면 서로의 것을 지운다. 그건 `layout-customer.spec.ts` 가 한국어로
 * 이미 재고 있고, 넘침은 말이 길어져서 생기지 자료가 있어서 생기지 않는다.
 *
 * 좁은 두 폭만 본다 — 잡히는 곳은 늘 가장 좁은 쪽이다.
 */

test.use({ storageState: STATE_FILE.cartLayout });

const PAGES = [
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
] as const;

const NARROW = [320, 375] as const;

/**
 * **재려던 화면을 재고 있는지 한 번 못 박는다.**
 *
 * 세션이 없으면 마이페이지는 로그인 화면으로 보내고, 그 화면은 단순해서
 * 어느 폭에서도 안 무너진다 — 위 검사가 전부 통과하면서 정작 재려던 화면은
 * 한 번도 안 본 상태가 될 수 있다.
 *
 * 정직하게 적어 둔다: **그런 경우를 실제로 만들어 보지는 못했다.** 이 파일이
 * 한 번 엉뚱한 프로젝트(guest)에 잡힌 적이 있는데, 그때는 조용히 통과한 것이
 * 아니라 요란하게 다 졌다. 세션을 빼도 프로젝트가 자기 세션을 주므로 여전히
 * 로그인된 채로 돈다. 그러니 이것은 잡은 적 있는 그물이 아니라, 전제를 눈에
 * 보이게 적어 둔 한 줄이다.
 */
test('로그인한 채로 재고 있다', async ({ page }) => {
  await page.goto('/mypage');
  await expect(page).toHaveURL(/\/mypage$/);
});

test.describe('영어', () => {
  test.use({ locale: 'en-US' });
  layoutTests(test, expect, PAGES, NARROW);
});

test.describe('일본어', () => {
  test.use({ locale: 'ja-JP' });
  layoutTests(test, expect, PAGES, NARROW);
});
