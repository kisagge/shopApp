import { test, expect, type Page } from '@playwright/test';
import { STATE_FILE, ready } from './state';

/**
 * 검수 결과가 상품을 올린 가맹점에게 닿는가.
 *
 * **사유는 진작 받고 있었는데 닿지 않았다.** 검수 처리는 사유 없는 반려를 막고(REJECT_REASON_REQUIRED) 그 글을
 * 상품 행에 적어 두는데, 적어 두기만 했다 — 가맹점은 자기 상품을 다시 열어 봐야 그것을 봤다. 검수는 며칠 걸리는
 * 일이라 다시 열어 볼 이유가 없다.
 *
 * 누구에게 가는지·무엇이 실리는지는 단위 검사가 본다. 여기서 보는 것은 **운영 화면에서 누른 것이 다른 계정의, 다른
 * 알림함까지 건너오는가**다 — 두 사람을 한 검사 안에서 함께 여는 자리라 e2e 말고는 볼 방법이 없다.
 *
 * 한 바퀴를 다 돈다: 요청 → 반려(사유) → 가맹점이 읽음 → 다시 요청 → 게시 → 가맹점이 읽음. 승인도 알린다는 것을
 * 함께 보고, 빌린 상품이 원래 자리(판매중)로 돌아간다.
 */

/**
 * 가맹점 알림함에 그 말이 뜰 때까지 **다시 열어 보며** 기다린다.
 *
 * 처음에는 한 번 열고 `toBeVisible()` 로 기다렸다가 졌다 — 그 단정은 기다리는 동안 페이지를 다시 열지 않는다.
 * 운영진이 누른 것이 서버를 거쳐 다른 계정의 알림함에 닿는 데는 시간이 걸리고, 이미 그려진 화면에는 영영 안 뜬다.
 */
async function expectNotice(merchant: Page, box: string, text: string, message: string) {
  await expect
    .poll(
      async () => {
        await merchant.goto(box);
        await ready(merchant);
        return merchant.getByText(text, { exact: false }).count();
      },
      { message, timeout: 30_000 },
    )
    .toBeGreaterThan(0);
}

test.describe.configure({ mode: 'serial' });

/** 다른 명세가 쓰지 않는 가맹점 상품. 시드에서 판매중이라 게시로 되돌려 놓을 수 있다. */
const PRODUCT_NAME = '숏 패딩 블루종';

/**
 * 가맹점이 검수를 요청한다.
 *
 * 가맹점의 상품 목록은 자기 것만 보여 줘서 한 쪽에 다 들어온다 — 운영진 목록과 달리 찾아다닐 필요가 없다.
 */
async function requestReview(merchant: Page) {
  await merchant.goto('/admin/products');
  await ready(merchant);
  const link = merchant.getByRole('link', { name: PRODUCT_NAME }).first();
  await expect(link, '가맹점 목록에 시드 상품이 없다').toBeVisible();
  await link.click();
  await ready(merchant);

  // 가맹점은 '판매중' 을 스스로 고를 수 없다. 요청할 길만 있다(merchant.spec).
  await merchant.getByLabel('판매 상태').selectOption('PENDING_REVIEW');
  await merchant.getByRole('button', { name: '변경 사항 저장' }).click();
  await expect(merchant.getByRole('button', { name: '저장 중…' })).toHaveCount(0);
}

/**
 * 검수 대기줄에서 그 상품 줄을 집는다.
 *
 * 저장은 서버로 갔다 오므로 한 번 보고 없다고 단정하지 않는다 — 다시 열어 보며 기다린다.
 */
async function waitForPendingRow(admin: Page) {
  await expect
    .poll(
      async () => {
        await admin.goto('/admin/products?status=PENDING_REVIEW');
        await ready(admin);
        return admin.getByRole('row').filter({ hasText: PRODUCT_NAME }).count();
      },
      { message: '검수 대기줄에 안 올라왔다', timeout: 30_000 },
    )
    .toBeGreaterThan(0);

  return admin.getByRole('row').filter({ hasText: PRODUCT_NAME }).first();
}

test('반려하면 사유가, 게시하면 그 소식이 올린 가맹점의 운영 알림함에 뜬다', async ({ browser }) => {
  test.setTimeout(150_000);
  const adminCtx = await browser.newContext({ storageState: STATE_FILE.admin });
  const merchantCtx = await browser.newContext({ storageState: STATE_FILE.merchant });
  const admin = await adminCtx.newPage();
  const merchant = await merchantCtx.newPage();
  const stamp = Date.now().toString(36);
  const reason = `대표 이미지를 바꿔 주세요 — 검수 알림 검사 ${stamp}`;

  try {
    await requestReview(merchant);

    // 반려한다 — 사유를 적기 전에는 누를 수 없다
    const row = await waitForPendingRow(admin);
    await row.getByRole('button', { name: '반려' }).click();
    await row.getByLabel(`${PRODUCT_NAME} 반려 사유`).fill(reason);
    await row.getByRole('button', { name: '반려', exact: true }).click();

    // **처리가 끝난 것을 보고 넘어간다.** 누르자마자 다음으로 가면 서버가 아직 쓰는 중이다.
    await expect(row, '반려한 줄이 대기 탭에 남아 있다').toHaveCount(0);

    // 가맹점의 운영 알림함에 사유와 함께 떠 있다
    await expectNotice(
      merchant, '/admin/notifications', reason,
      '가맹점 알림함에 반려 사유가 오지 않았다',
    );

    /*
     * **손님으로 온 자리에는 뜨지 않는다.** 같은 표를 두 알림함이 나눠 쓰므로, 가리는 규칙이 새면 매장 알림함에
     * "검수에서 되돌아왔습니다" 가 뜬다 — 그건 거기서 들을 말이 아니다.
     */
    await merchant.goto('/mypage/notifications');
    await ready(merchant);
    await expect(merchant.getByText(reason, { exact: false })).toHaveCount(0);

    // 고쳐서 다시 올린다 → 게시. 승인도 알린다 — 안 알리면 며칠째 대기줄인 줄 안다.
    await requestReview(merchant);
    const again = await waitForPendingRow(admin);
    await again.getByRole('button', { name: '게시' }).click();
    await expect(again, '게시한 줄이 대기 탭에 남아 있다').toHaveCount(0);

    await expectNotice(
      merchant, '/admin/notifications', `${PRODUCT_NAME} 검수를 통과했습니다`,
      '게시 소식이 오지 않았다',
    );
  } finally {
    await adminCtx.close();
    await merchantCtx.close();
  }
});
