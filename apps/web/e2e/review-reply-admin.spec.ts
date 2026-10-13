import { test, expect, type Page } from '@playwright/test';
import { STATE_FILE, ready } from './state';

/**
 * 가맹점이 자기 상품 리뷰에 답글을 달고, 고치고, 지운다 — 손님이 보는 상품 화면에 그대로 따라오는가.
 *
 * 저장 규칙·범위·알림은 단위 검사가 본다. 여기서 보는 것은 **운영 화면에서 한 말이 캐시를 지나 상품 화면의 그 리뷰
 * 안에 뜨는가**다. 리뷰를 쓰고 읽는 명세들이 쓰지 않는 스튜디오눈 상품(레더 카드 지갑)의 시드 리뷰를 쓰고, 끝나면
 * 답글을 지워 흔적을 남기지 않는다.
 */

test.describe.configure({ mode: 'serial' });

const PRODUCT_NAME = '레더 카드 지갑';
const PRODUCT_PATH = '/product/leather-card-wallet';

async function firstReview(page: Page) {
  await page.goto(`/admin/reviews?tab=all&q=${encodeURIComponent(PRODUCT_NAME)}`);
  await ready(page);
  const article = page.getByRole('article').first();
  await expect(article, '시드 리뷰가 없다').toBeVisible();
  return article;
}

/**
 * 손님 화면의 판매자 답글.
 *
 * **리뷰 칸은 Suspense 뒤에서 흘러온다.** `ready` 는 머리글(껍데기)만 보고 돌아오므로, 바로
 * 세면 아직 도착하지 않은 칸을 **"답글이 없다" 로 읽는다.** 다시 불러 세기를 거듭해도 매번
 * 같은 경주를 하니, 기다림을 20초로 늘려 둔 것으로는 운에 기대는 것이 그대로다 — 실제로
 * 게이트 두 판에서 같은 줄이 졌다.
 *
 * 그래서 세기 전에 그 칸이 **왔는지부터** 본다. 빈자리(`SectionSkeleton`)는 aria-hidden
 * 이라 접근성 나무에 없고, 그래서 이 기다림에 걸리지 않는다 — 뼈대를 칸으로 착각하지 않는다.
 */
async function publicReply(page: Page) {
  await page.reload();
  await ready(page);
  // 한 번의 기다림이 폴링의 20초를 통째로 먹지 않게 — 안쪽 상한은 바깥보다 작아야 한다
  await page.getByRole('region', { name: /^리뷰 / }).waitFor({ state: 'attached', timeout: 10_000 });
  return page.getByRole('region', { name: /판매자 답글/ });
}

test('가맹점이 단 답글이 상품 화면의 그 리뷰 안에 뜨고, 고치면 "수정됨", 지우면 사라진다', async ({ browser }) => {
  test.setTimeout(120_000);
  const merchant = await browser.newContext({ storageState: STATE_FILE.merchant });
  const guest = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const mp = await merchant.newPage();
  const gp = await guest.newPage();
  const stamp = Date.now().toString(36);
  const text = `찾아 주셔서 감사합니다 — 답글 검사 ${stamp}`;

  try {
    let review = await firstReview(mp);
    // 앞선 실행이 남긴 답이 있으면 지우고 시작한다
    if (await review.getByRole('button', { name: '답글 지우기' }).count()) {
      await review.getByRole('button', { name: '답글 지우기' }).click();
      await review.getByRole('button', { name: '답글 지우기 확인' }).click();
      await expect(review.getByRole('status')).toHaveText('답글을 지웠습니다.');
      review = await firstReview(mp);
    }

    // ── 가맹점: 답글 달기
    await review.getByLabel(`${PRODUCT_NAME} 리뷰에 남길 답글`).fill(text);
    await review.getByRole('button', { name: '답글 달기' }).click();
    await expect(review.getByRole('status')).toContainText('알림이 갑니다');
    // 누가 답했는지가 답글 곁에 선다 — 같은 가게 사람이 보면 이름만(운영진이면 "운영진")
    await expect(review.getByText(/^답글 · 스튜디오눈 담당자 · /)).toBeVisible({ timeout: 20_000 });

    // ── 손님(비로그인): 상품 화면의 리뷰 안에 판매자 답글
    await gp.goto(PRODUCT_PATH);
    await ready(gp);
    await expect.poll(async () => (await publicReply(gp)).filter({ hasText: text }).count(), { timeout: 20_000 }).toBe(1);
    const shown = gp.getByRole('region', { name: /판매자 답글/ }).filter({ hasText: text });
    // 답은 리뷰 글(article) 안에 있다 — 어느 글에 한 답인지 떨어져 있지 않다
    await expect(gp.getByRole('article').filter({ has: shown })).toHaveCount(1);
    await expect(shown.getByText('수정됨')).toHaveCount(0);

    // ── 가맹점: 고치기 → 손님 화면에 "수정됨"
    review = await firstReview(mp);
    await review.getByRole('button', { name: '답글 고치기' }).click();
    await review.getByLabel(`${PRODUCT_NAME} 리뷰에 남길 답글`).fill(`${text} (고침)`);
    await review.getByRole('button', { name: '답글 저장' }).click();
    await expect(review.getByRole('status')).toHaveText('답글을 고쳤습니다.');
    await expect.poll(async () => (await publicReply(gp)).filter({ hasText: `${text} (고침)` }).getByText('수정됨').count(), { timeout: 20_000 }).toBe(1);

    // ── 가맹점: 지우기 → 손님 화면에서 사라진다
    review = await firstReview(mp);
    await review.getByRole('button', { name: '답글 지우기' }).click();
    await review.getByRole('button', { name: '답글 지우기 확인' }).click();
    await expect(review.getByRole('status')).toHaveText('답글을 지웠습니다.');
    await expect.poll(async () => (await publicReply(gp)).filter({ hasText: stamp }).count(), { timeout: 20_000 }).toBe(0);
  } finally {
    await Promise.all([merchant.close(), guest.close()]);
  }
});
