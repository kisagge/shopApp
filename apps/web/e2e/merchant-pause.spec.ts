import { test, expect, type Page } from '@playwright/test';
import { SEED_ACCOUNT, SEED_PASSWORD } from '@shop/auth/seed-fixtures';
import { ready, STATE_FILE } from './state';

/**
 * 운영진이 가맹점을 멈추면, 그 가게 사람들이 그것을 듣는다.
 *
 * **단위 검사는 각자의 조각만 본다** — 사유가 행에 남는가, 알림이 만들어지는가, 화면이 그것을 그리는가.
 * 여기서 보는 것은 **그 셋이 한 줄로 이어지는가**다: 운영진이 누른 순간부터 담당자의 알림함과 안내 화면까지.
 * 사유는 진작 받고 있었는데 감사 로그에만 남아, 정작 멈춘 가게는 콘솔이 닫힌 것만 보던 자리다.
 *
 * **파일 이름에 "admin" 을 넣지 않는다.** 운영 프로젝트의 testMatch 가 이름에 admin 이 든 파일을 전부 잡아,
 * 같은 명세가 두 프로젝트에서 동시에 돌며 같은 가게를 두고 서로 밀친다(한 판이 그렇게 졌다).
 *
 * 멈출 가게를 따로 둔다("잠깐가게", 브랜드도 상품도 없다). 장사하는 가맹점을 멈추면 그 가맹점을 쓰는 다른
 * 명세가 함께 무너지고, 이미 멈춰 있는 쉬는가게로는 "멈추는 순간" 을 볼 수 없다. 끝나면 되돌린다.
 */

test.describe.configure({ mode: 'serial' });

const SHOP = '잠깐가게';
const REASON = '정산 계좌 명의 확인이 필요합니다. 서류를 보내 주시면 다시 열어 드립니다.';

/** 가맹점 줄의 상태 폼. 승인·정지를 누르는 자리다 */
function statusForm(page: Page) {
  return page.getByRole('row').filter({ hasText: SHOP });
}

/**
 * 상태를 바꾸고 **서버가 받아들였는지까지** 본다.
 *
 * 고르개의 값으로 보면 안 된다 — 방금 내가 고른 값이라 저장에 실패해도 그대로 서 있다(한 판이 그렇게 지나갔고,
 * 그 다음 검사가 아직 멈추지 않은 가게를 보며 15초를 기다렸다). 뱃지 글자도 안 된다: "일시 정지" 는 같은 줄의
 * 고르개 선택지에도 있다. 응답을 기다린다.
 */
async function setStatus(page: Page, status: 'SUSPENDED' | 'APPROVED', reason?: string): Promise<void> {
  const row = statusForm(page);
  await row.getByLabel(`${SHOP} 입점 상태`).selectOption(status);
  if (reason !== undefined) await row.getByLabel('사유 (필수)').fill(reason);

  const [response] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'PATCH' && /\/api\/admin\/merchants\/.+\/status$/.test(r.url())),
    row.getByRole('button', { name: '적용' }).click(),
  ]);
  expect(response.status(), await response.text()).toBe(200);
}

test('멈추면 그 가게 담당자가 까닭과 함께 듣고, 콘솔 대신 안내 화면을 본다', async ({ browser }) => {
  const superAdmin = await browser.newContext({ storageState: STATE_FILE.superAdmin });
  const seller = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  try {
    // ── 담당자: 멈추기 전에는 콘솔을 쓴다
    const sp = await seller.newPage();
    await sp.goto('/login');
    await ready(sp);
    await sp.getByLabel('이메일').fill(SEED_ACCOUNT.pausableMerchant);
    await sp.getByLabel('비밀번호').fill(SEED_PASSWORD);
    await sp.getByRole('button', { name: '로그인' }).click();
    await expect(sp.getByRole('link', { name: '마이페이지' })).toBeVisible({ timeout: 20_000 });

    await sp.goto('/admin');
    await ready(sp);
    await expect(sp.getByRole('heading', { name: '대시보드', level: 1 })).toBeVisible();

    // ── 운영진(입점 승인은 슈퍼관리자만): 사유를 적어 멈춘다
    const ap = await superAdmin.newPage();
    await ap.goto('/admin/merchants');
    await ready(ap);
    await setStatus(ap, 'SUSPENDED', REASON);

    // ── 담당자: 알림함에 까닭이 오고, 누르면 안내 화면으로 간다
    await sp.goto('/mypage/notifications');
    await ready(sp);
    const notice = sp.getByRole('list', { name: '알림' }).getByRole('link')
      .filter({ hasText: `${SHOP} 의 운영이 정지되었습니다` });
    await expect(notice).toHaveCount(1);

    await expect(notice).toContainText('까닭: 정산 계좌 명의 확인이 필요합니다');
    await notice.click();
    await sp.waitForURL(/\/merchant\/suspended$/);
    await ready(sp);

    // ── 담당자: 콘솔은 닫혔고, 그 자리에 까닭이 있다. 세션 캐시를 기다리지 않는다
    const guide = sp.getByRole('region', { name: new RegExp(`${SHOP} — 일시 정지`) });
    await expect(guide).toContainText(REASON);
    await sp.goto('/admin');
    await sp.waitForURL(/\/merchant\/suspended$/);
  } finally {
    // 되돌린다 — 남겨 두면 다음 판이 멈춘 가게에서 시작한다
    const ap = await superAdmin.newPage();
    await ap.goto('/admin/merchants');
    await ready(ap);
    await setStatus(ap, 'APPROVED');
    await Promise.all([superAdmin.close(), seller.close()]);
  }
});
