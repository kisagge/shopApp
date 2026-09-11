import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { layoutTests } from './layout';

/**
 * 한국어가 아닌 말로도 자리가 무너지지 않는가.
 *
 * **`layout.spec.ts` 는 한국어로만 돈다.** 화면 14개를 폭 4가지로 꼼꼼히 훑는
 * 좋은 검사인데, 이 앱은 세 말로 나가고 **한국어가 그중 가장 짧다.** 가장 짧은
 * 말로만 재는 것은 가장 쉬운 경우만 보는 것이다.
 *
 * 실제로 그랬다. 일본어 상품 상세가 320px 에서 가로로 넘쳤는데(362 > 320)
 * 같은 화면이 한국어로는 깨끗해서 아무도 몰랐다. 범인은 장바구니 담기 줄이다 —
 * "カートに入れる" 와 "オプションを選択してください" 가 줄바꿈 없는 가로줄에
 * 나란히 서서 최소 폭이 346px 이 됐고, 320px 화면의 본문은 288px 이다.
 *
 * 좁은 폭만 잰다. 넓은 화면에서는 글자가 길어져도 자리가 남고, 세 말을 네 폭
 * 으로 다 돌리면 검사 수가 세 배가 된다 — 잡히는 곳은 늘 가장 좁은 쪽이다.
 */

/** 좁은 화면의 유일한 통로. **말에 기대지 않고** 집는다 */
const openMenu = async (page: Page): Promise<void> => {
  /*
   * 이름(`메뉴`)으로 찾으면 말을 바꾸는 순간 못 찾는다. 이 단추는 패널을
   * 여닫는 것이라 `aria-controls` 가 있고, 그 값은 말과 무관하다.
   */
  const button = page.locator('header button[aria-controls][aria-expanded]').first();
  if (!(await button.isVisible())) return;

  await button.click();
  await page.locator('header a[href^="/category/"]').first().waitFor({ state: 'visible' });
};

/** 넘칠 데가 있는 화면들 — 글자가 길어지면 먼저 티가 나는 자리다 */
const PAGES = [
  ['홈', '/'],
  ['카테고리', '/category/outer-coat'],
  ['상품 상세', '/product/oversized-wool-coat'],
  ['장바구니', '/cart'],
  ['로그인', '/login'],
  ['회원가입', '/signup'],
  ['고객센터 문의하기', '/support/ask'],
  ['기획전', '/collection/winter-outer'],
  ['상품 비교', '/compare?slugs=oversized-wool-coat,single-chesterfield-coat'],
  ['사이드바 열림', '/', openMenu],
] as const;

/** 가장 좁은 두 폭. 넘치는 것은 언제나 여기서 먼저 보인다 */
const NARROW = [320, 375] as const;

test.describe('영어', () => {
  test.use({ locale: 'en-US' });
  layoutTests(test, expect, PAGES, NARROW);
});

test.describe('일본어', () => {
  test.use({ locale: 'ja-JP' });
  layoutTests(test, expect, PAGES, NARROW);
});
