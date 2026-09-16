import { test, expect } from '@playwright/test';
import { ready, STATE_FILE } from './state';

/**
 * 약관·개인정보처리방침을 운영 화면에서 고친다.
 *
 * **저장은 덮어쓰기가 아니라 갈아 끼우기다.** 여기서 보는 것은 그 약속이 실제로 지켜지는지다 — 고치고 나면 손님 화면에
 * 새 내용이 뜨고, 바뀌기 전 내용은 지난 방침으로 남아 그 주소로 다시 열린다. 동의 기록은 시각 하나뿐이라(가입 훅),
 * 지난 내용이 사라지면 "그날 무엇에 동의했는가" 에 답할 수 없다.
 *
 * 끝나면 제목을 되돌린다 — 다른 명세가 시드 문서를 본다.
 */

test.describe.configure({ mode: 'serial' });

const SEEDED_TITLE = 'PLAIN 이용약관';
const CHANGED_TITLE = 'PLAIN 이용약관 (개정)';

test('고친 약관이 손님 화면에 뜨고, 바뀌기 전 내용은 지난 방침으로 남는다', async ({ page, browser }) => {
  await page.goto('/admin/policies');
  await ready(page);

  const terms = page.getByRole('region', { name: '이용약관' });
  await expect(terms.getByLabel(/^제목/)).toHaveValue(SEEDED_TITLE);

  // 시행일을 앞날로 적으면 손님 화면이 "며칠 뒤부터" 라고 안내한다
  await terms.getByLabel(/^제목/).fill(CHANGED_TITLE);
  await terms.getByRole('button', { name: '새 판으로 저장' }).click();
  await expect(terms.getByRole('status')).toContainText('지난 방침으로 남았습니다', { timeout: 20_000 });

  // ── 손님: 로그인하지 않아도 읽을 수 있어야 한다. 동의를 받는 문서다
  const guest = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  try {
    const gp = await guest.newPage();
    await gp.goto('/terms');
    await ready(gp);
    await expect(gp.getByRole('heading', { level: 1 })).toHaveText(CHANGED_TITLE);
    // 본문과 지난 방침 목록에도 "시행일" 이 있다 — 머리에 적힌 시각 하나만 본다
    await expect(gp.getByRole('time')).toHaveText(/시행일/);

    // 지난 방침이 목록에 있고, 눌러서 그때 내용을 볼 수 있다
    const past = gp.getByRole('region', { name: '지난 방침' });
    await expect(past).toBeVisible();
    await past.getByRole('link').first().click();
    await gp.waitForURL(/\/terms\?v=/);
    await ready(gp);
    await expect(gp.getByRole('heading', { level: 1 })).toHaveText(SEEDED_TITLE);
    await expect(gp.getByText(/지난 방침입니다/)).toBeVisible();

    // 지금 방침으로 돌아오는 길이 있다 — 지난 글에 갇히면 안 된다
    await gp.getByRole('link', { name: '지금 방침 보기' }).click();
    await gp.waitForURL(/\/terms$/);
    await expect(gp.getByRole('heading', { level: 1 })).toHaveText(CHANGED_TITLE);
  } finally {
    await guest.close();
  }

  // 되돌린다 — 이 역시 한 판으로 남는다
  await page.goto('/admin/policies');
  await ready(page);
  const again = page.getByRole('region', { name: '이용약관' });
  await again.getByLabel(/^제목/).fill(SEEDED_TITLE);
  await again.getByRole('button', { name: '새 판으로 저장' }).click();
  await expect(again.getByRole('status')).toContainText('저장했습니다', { timeout: 20_000 });
});

test('가맹점은 가게 전체의 약속을 고치지 못한다', async ({ browser }) => {
  const merchant = await browser.newContext({ storageState: STATE_FILE.merchant });
  try {
    const mp = await merchant.newPage();

    // 메뉴에 없고, 주소로 쳐도 들어가지 못한다
    await mp.goto('/admin');
    await ready(mp);
    await expect(mp.getByRole('link', { name: '약관·방침' })).toHaveCount(0);

    await mp.goto('/admin/policies');
    expect(new URL(mp.url()).pathname).not.toBe('/admin/policies');

    const refused = await mp.request.put('/api/admin/policies/TERMS', {
      data: {
        title: '가맹점이 고친 약관',
        effectiveOn: '2026-01-01',
        bodyRich: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '아무거나' }] }] },
      },
      failOnStatusCode: false,
    });
    expect(refused.status(), '가맹점이 약관을 고칠 수 있다').toBe(403);
  } finally {
    await merchant.close();
  }
});
