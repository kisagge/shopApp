import { test, expect } from '@playwright/test';
import { STATE_FILE, ready } from './state';

test.use({ storageState: STATE_FILE.customer });

/**
 * 미리받기 예산.
 *
 * **미리받기 한 번이 서버 렌더 한 번이다.** 이 앱의 화면은 거의 다
 * `force-dynamic` 이라, 링크가 화면에 들어오는 것만으로 함수가 깨어나 화면을
 * 그린다. 사람이 그 화면에 갈지와는 무관하게 그렇다.
 *
 * 기기에서 주문을 재다가 봤다. 결제 버튼을 누르고 주문이 도는 1초 남짓 동안
 * RSC 미리받기가 7~8개 함께 나갔다 — 하필 사람이 기다리는 그 순간에 대역폭과
 * 함수를 나눠 쓴다. 그중에는 푸터의 고객센터·입점문의처럼 **결제하러 온 사람이
 * 누를 일이 거의 없는 것**들이 있었다.
 *
 * 그래서 예산을 둔다. 값을 세는 것이 아니라 **무엇을 미리 받는지**를 본다 —
 * 개수는 화면 크기와 스크롤에 따라 흔들리지만, "결제 화면에서 입점문의를 미리
 * 받는다" 는 크기와 무관하게 잘못이다.
 */

/**
 * 사람이 그 화면에서 누를 일이 거의 없는, 모든 화면에 붙어 있는 링크들.
 *
 * **머리 메뉴는 일부러 넣지 않았다.** 이 목록을 만든 뒤에도 /checkout 은
 * 미리받기 18개를 낸다 — 매대·마이페이지·장바구니로, 전부 머리 메뉴 몫이다.
 * 그것들은 다른 화면에서는 실제로 누르는 링크라 미리 받아 두는 편이 맞고,
 * 결제 화면에서만 끄려면 머리가 현재 경로를 보고 갈라져야 한다.
 *
 * 재 보고 그냥 두기로 했다. 18개가 각각 200~300ms 인데 병렬로 나가고,
 * 결제 버튼에서 주문 화면까지가 1.3초 안에 끝난다 — 총 시간에 눈에 띄는
 * 몫이 아니다. 값이 달라지면 그때 다시 판단할 일이지, 지금 헤더에 화면별
 * 분기를 넣을 이유는 없다.
 */
const FURNITURE = ['/support', '/merchant/apply', '/admin'];

async function prefetched(page: import('@playwright/test').Page, path: string) {
  const hits: string[] = [];
  page.on('request', (req) => {
    const u = new URL(req.url());
    if (u.searchParams.has('_rsc')) hits.push(u.pathname);
  });
  await page.goto(path);
  await ready(page);
  // 링크가 화면에 들어오도록 끝까지 내린다 — 짧은 화면에서는 처음부터 들어와 있다
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(2500);
  return hits;
}

for (const path of ['/checkout', '/cart']) {
  test(`${path} 는 붙박이 링크를 미리 받지 않는다`, async ({ page }) => {
    const hits = await prefetched(page, path);
    const waste = FURNITURE.filter((f) => hits.some((h) => h === f));
    expect(waste, `${path} 에서 ${waste.join(', ')} 를 미리 받았다 — 화면 하나가 통째로 그려진다`)
      .toEqual([]);
  });
}
