import { test, expect } from '@playwright/test';
import { STATE_FILE, ready } from './state';

test.use({ storageState: STATE_FILE.customer });

/**
 * 누르면 반응하는가.
 *
 * 이 앱의 화면은 거의 다 `force-dynamic` 이라, 링크를 눌러도 서버가 다 그릴
 * 때까지 화면이 그대로다. 기기에서 재 보니 그 침묵이 0.6~1초였다. 그때
 * 아무 표시가 없으면 사람은 안 눌린 줄 알고 다시 누른다 — 그래서 앱에서
 * 신고가 왔고 `NavProgress` 가 만들어졌다.
 *
 * **그런데 정작 붙은 곳은 상품 카드뿐이었다.** 재 보니 이랬다.
 *
 *   홈→상품 (AppLink)      첫 변화 129ms · 이동 표시 있음
 *   상세→빵부스러기        첫 변화 200ms · 표시 없음
 *   마이페이지→주문내역    첫 변화 111ms · 표시 없음
 *   마이페이지→찜          첫 변화 104ms · 표시 없음
 *   장바구니→쇼핑계속      첫 변화 105ms · 표시 없음
 *
 * 여기 숫자가 작은 것은 이 검사가 localhost 를 보기 때문이다. 배포에서는
 * 같은 이동이 0.6~1초다. 그래서 **시간을 재지 않고 표시가 뜨는지만** 본다 —
 * 시간은 기계와 망을 타지만, 표시가 없다는 것은 어디서든 잘못이다.
 *
 * `loading.tsx` 로는 못 한다. 그 길은 이미 시도했다가 뺐다 — 껍데기를 먼저
 * 흘려보내면 상태 코드가 200 으로 굳어 없는 주소가 가짜 200 이 된다.
 * `nav-progress.tsx` 주석과 `test/streaming-boundaries.test.ts` 참고.
 */

/**
 * 누른 뒤 이동 표시가 **한 번이라도** 떴는가.
 *
 * 처음에는 10ms 간격으로 화면을 훑었는데, 그러면 빠른 이동에서 표시가
 * 떴다 사라지는 순간을 통째로 놓친다 — 실제로 빵부스러기 하나가 그렇게
 * 거짓으로 졌다. 소프트 이동은 문서를 갈아치우지 않으므로, 누르기 전에
 * 관찰자를 붙여 두면 놓칠 일이 없다.
 */
async function showsProgress(
  page: import('@playwright/test').Page,
  from: string,
  name: RegExp,
  scope?: string,
): Promise<boolean> {
  await page.goto(from);
  await ready(page);
  /*
   * 어느 링크인지 **범위로 못 박는다.** 처음에는 이름만으로 골랐는데
   * `아우터` 가 빵부스러기에도 머리 메뉴에도 있어서, 빵부스러기를 잰다고
   * 적어 놓고 실제로는 머리 메뉴를 재고 있었다.
   */
  const link = scope
    ? page.getByRole('navigation', { name: scope }).getByRole('link', { name }).first()
    : page.getByRole('link', { name }).first();
  await expect(link, `${from} 에서 누를 링크를 못 찾았다`).toBeVisible();

  await page.evaluate(() => {
    const w = window as unknown as { __sawProgress?: boolean };
    w.__sawProgress = false;
    new MutationObserver(() => {
      if (document.querySelector('.nav-progress')) w.__sawProgress = true;
    }).observe(document.body, { childList: true, subtree: true });
  });

  await link.click({ noWaitAfter: true });
  await page.waitForTimeout(1500);

  return page.evaluate(
    () => (window as unknown as { __sawProgress?: boolean }).__sawProgress === true,
  );
}

const CASES = [
  { from: '/product/oversized-wool-coat', name: /^코트$/, scope: '현재 위치', label: '상품 상세의 빵부스러기' },
  { from: '/product/oversized-wool-coat', name: /^아우터$/, scope: '카테고리', label: '머리의 매대 메뉴' },
  { from: '/mypage', name: /^주문 내역/, label: '마이페이지 메뉴' },
  { from: '/mypage', name: /^찜한 상품/, label: '마이페이지의 찜' },
  { from: '/', name: /오버사이즈 울 블렌드 코트/, label: '매대의 상품 카드' },
] as const;

for (const c of CASES) {
  const { from, name, label } = c;
  const scope = 'scope' in c ? c.scope : undefined;
  test(`${label} 을 누르면 이동 중인 것이 보인다`, async ({ page }) => {
    expect(
      await showsProgress(page, from, name, scope),
      `${label}: 눌러도 아무 표시가 없다 — 사람은 안 눌린 줄 안다`,
    ).toBe(true);
  });
}
