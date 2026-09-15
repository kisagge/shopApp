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

async function publicReply(page: Page) {
  await page.reload();
  await ready(page);
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
