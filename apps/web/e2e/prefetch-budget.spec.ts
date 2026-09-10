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

/** 사람이 그 화면에서 누를 일이 거의 없는, 모든 화면에 붙어 있는 링크들 */
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
