import { test, expect } from '@playwright/test';
import { ready } from './state';

/**
 * 운영진이 회원 등급을 올려 준다.
 *
 * **쓰는 코드가 앱 전체에 하나도 없었다.** 스키마에는 칸이 있고 core 의 주석은 그 존재 이유를 "운영진이
 * 수동으로 올려 주는 경우(제휴·보상)" 라고 적어 두었는데, 올려 줄 창구가 없어 DB 를 직접 만져야 했다 —
 * 등급에는 적립률이 붙어 있으니 그건 곧 돈이고, 그렇게 하면 감사 로그도 안 남는다.
 *
 * 단위 검사는 판정과 창구를 따로 본다. 여기서 보는 것은 **길이 이어지는가**다: 운영 화면에서 올린 등급이
 * 그 손님의 마이페이지에 뜨고, 기록에도 남는가.
 *
 * **새로 가입한 계정을 쓴다.** 등급은 되돌리는 길이 없다(내리는 것은 뜻이 없다 — 실제 등급은 구매액과
 * 저장된 값 중 높은 쪽이다). 시드 계정에 걸면 그 계정을 쓰는 다른 검사의 적립률이 바뀐다.
 */
test('운영진이 올려 준 등급이 손님 화면에 뜨고 기록에 남는다', async ({ page, browser }) => {
  test.setTimeout(120_000);

  const email = `e2e-grade-${Date.now()}@plain.test`;
  const password = 'quiet-harbor-42';

  // ── 손님: 가입한다
  const guest = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  try {
    const shop = await guest.newPage();
    await shop.goto('/signup');
    await ready(shop);
    await shop.getByLabel(/^이메일/).fill(email);
    await shop.getByLabel(/^이름/).fill('등급 검사');
    await shop.getByLabel(/^비밀번호\*/).fill(password);
    await shop.getByLabel(/^비밀번호 확인/).fill(password);
    await shop.getByLabel(/이용약관에 동의합니다/).check();
    await shop.getByLabel(/개인정보 수집/).check();
    await shop.getByRole('button', { name: '가입하기' }).click();
    await expect(shop.getByRole('link', { name: '마이페이지' })).toBeVisible({ timeout: 20_000 });

    // 갓 가입했으니 베이직이다
    await shop.goto('/mypage');
    await ready(shop);
    await expect(shop.getByText('베이직').first()).toBeVisible();

    // ── 운영진: 그 사람을 찾아 올려 준다
    await page.goto(`/admin/users?q=${encodeURIComponent(email)}`);
    await ready(page);
    await page.getByRole('row').filter({ hasText: email }).getByRole('link').first().click();
    await page.waitForURL(/\/admin\/users\/[^/]+$/);
    await ready(page);

    const panel = page.getByRole('region', { name: '회원 등급' });
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: '등급 올리기' }).click();
    await panel.getByLabel('올려 줄 등급').selectOption('VIP');
    await panel.getByLabel('사유 (필수)').fill('제휴 보상 — e2e');

    const [saved] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'PATCH' && r.url().includes('/grade')),
      panel.getByRole('button', { name: '등급 올리기' }).click(),
    ]);
    expect(saved.status(), await saved.text()).toBe(200);
    await expect(panel.getByText('VIP')).toBeVisible();

    // ── 손님 화면에도 그대로 뜬다 — 여기가 이 기능의 끝이다
    await shop.goto('/mypage');
    await shop.reload();
    await ready(shop);
    await expect(
      shop.getByText('VIP').first(),
      '운영에서 올렸는데 손님 화면은 그대로다',
    ).toBeVisible();

    // ── 기록: 누가 왜 올렸는지 남는다. 등급은 적립률이고 곧 돈이다
    await page.goto('/admin/audit?action=user.setGrade');
    await ready(page);
    await expect(page.getByRole('row').filter({ hasText: '회원 등급 조정' }).first()).toBeVisible();
  } finally {
    await guest.close();
  }
});
