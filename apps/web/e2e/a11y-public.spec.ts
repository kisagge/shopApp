import { test } from '@playwright/test';
import { expectNoA11yViolations } from './axe';
import { ready } from './state';

/**
 * 손님이 보는 화면 전부를 axe 로 훑는다.
 *
 * 여기 없던 동안 자동 검사는 **홈 한 장**만 지나갔다. 상품·장바구니·결제·
 * 검색은 손으로 적은 규칙 몇 개 말고는 아무것도 보지 않았다.
 */

const PAGES: readonly (readonly [string, string])[] = [
  ['홈', '/'],
  ['카테고리', '/category/outer'],
  ['상품 상세', '/product/oversized-wool-coat'],
  ['검색 결과', '/search?q=코트'],
  ['검색 결과 없음', '/search?q=zzzznothing'],
  ['기획전 목록', '/collections'],
  ['장바구니', '/cart'],
  ['로그인', '/login'],
  ['회원가입', '/signup'],
  ['고객센터', '/support'],
  ['공지', '/support/notice'],
  ['입점 신청', '/merchant/apply'],
  ['없는 주소', '/product/no-such-thing'],
  /*
   * 아래 넷은 처음 훑기를 만들 때 빠져 있었다. 로그인 앞뒤로 흩어져 있어
   * 목록을 손으로 적다 놓친 자리들이다 — **폼이 있는 화면일수록 이름표와
   * 오류 연결이 어긋날 자리가 많은데** 정작 그쪽이 빠졌다.
   */
  ['비밀번호 찾기', '/forgot-password'],
  // 열쇠 없이 열면 "다시 요청하세요" 상태가 뜬다. 그 상태도 화면이다.
  ['비밀번호 재설정', '/reset-password'],
  ['결제 실패', '/checkout/fail'],
  ['탈퇴 완료', '/account/closed'],
  ['오프라인', '/offline'],
];

for (const [name, path] of PAGES) {
  test(`${name} 화면에 접근성 위반이 없다`, async ({ page }) => {
    await page.goto(path);
    await ready(page);
    await expectNoA11yViolations(page);
  });
}

/**
 * 좁은 화면.
 *
 * **넓은 화면에는 없는 요소가 있다** — 모바일 메뉴, 접히는 필터, 아래
 * 고정 막대. 넓은 화면만 훑으면 그것들은 자동 검사를 한 번도 지나가지
 * 않는다. 여는 동작까지 해 봐야 메뉴 안쪽이 보인다.
 */
test.describe('좁은 화면', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  for (const [name, path] of [
    ['홈', '/'],
    ['카테고리', '/category/outer'],
    ['상품 상세', '/product/oversized-wool-coat'],
  ] as const) {
    test(`${name} 화면에 접근성 위반이 없다`, async ({ page }) => {
      await page.goto(path);
      await ready(page);
      await expectNoA11yViolations(page);
    });
  }

  test('모바일 메뉴를 연 상태에도 위반이 없다', async ({ page }) => {
    await page.goto('/');
    await ready(page);
    await page.getByRole('button', { name: /메뉴|menu/i }).first().click();
    await expectNoA11yViolations(page);
  });
});
