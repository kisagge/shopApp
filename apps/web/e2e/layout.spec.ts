import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { layoutTests } from './layout';

/**
 * 손님 화면의 자리.
 *
 * 로그인이 필요한 화면은 `layout-customer.spec.ts` 가 잰다 — 실기기에서
 * 나온 결함 하나가 주문 목록에 있었고, 그건 여기서 보이지 않는다.
 */

/**
 * 좁은 화면의 유일한 통로. **열어야만** 그 안이 보인다.
 *
 * 넓은 화면에서는 이 단추가 없다 — 그때는 아무것도 하지 않고 닫힌 채로 잰다.
 * 열렸다는 신호로 카테고리 링크를 본다(검색칸은 자동완성이라 역할이
 * combobox 다 — searchbox 로 기다리다 한 번 헛짚었다).
 */
const openMenu = async (page: Page): Promise<void> => {
  const button = page.getByRole('button', { name: '메뉴' });
  if (!(await button.isVisible())) return;

  await button.click();
  await page.locator('header a[href^="/category/"]').first().waitFor({ state: 'visible' });
};

layoutTests(test, expect, [
  ['홈', '/'],
  ['카테고리', '/category/outer-coat'],
  ['상품 상세', '/product/oversized-wool-coat'],
  ['검색 결과', '/search?q=코트'],
  ['장바구니', '/cart'],
  ['기획전 목록', '/collections'],
  ['로그인', '/login'],
  ['회원가입', '/signup'],
  ['고객센터', '/support'],
  ['상품 비교', '/compare?slugs=oversized-wool-coat,single-chesterfield-coat'],
  // 실기기에서 검색 버튼이 잘렸던 자리다. 닫힌 채로는 보이지 않는다.
  ['사이드바 열림', '/', openMenu],
]);
