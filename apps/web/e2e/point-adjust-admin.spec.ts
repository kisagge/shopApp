import { test, expect, type Page } from '@playwright/test';
import { SEED_ACCOUNT } from '@shop/auth/seed-fixtures';
import { STATE_FILE, ready } from './state';

/**
 * 운영진이 손님 적립금을 손으로 지급하고 차감한다.
 *
 * 규칙(한도·잔액·열쇠)은 단위 검사가 본다. 여기서 보는 것은 사람이 받는 결과다: 회원 목록에서 잔액을 누르면 내역과
 * 조정 폼이 나오고, 보내기 전에 한 번 더 보여 주고, 끝나면 잔액·내역이 바뀌고 **손님 적립금 내역에 사유가 보인다.**
 * 그리고 같은 열쇠로 두 번 보내도 한 번만 나간다.
 *
 * 자기 손님(pointAdjustTarget)을 쓴다. 준 만큼 다시 빼서 잔액을 처음으로 돌린다.
 */

const EMAIL = SEED_ACCOUNT.pointAdjustTarget;
const won = (text: string | null) => Number((text ?? '').replace(/[^\d]/g, ''));

async function customerBalance(page: Page): Promise<number> {
  await page.goto('/mypage/points');
  await ready(page);
  return won(await page.getByText('사용 가능 포인트').locator('xpath=following-sibling::span').textContent());
}

test('잔액을 눌러 들어가 지급·차감하면 잔액과 손님 내역이 바뀌고, 같은 열쇠는 한 번만 나간다', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const customer = await browser.newContext({ storageState: STATE_FILE.pointAdjustTarget });
  const cp = await customer.newPage();
  try {
    const start = await customerBalance(cp);

    // ── 회원 목록에서 이 손님의 잔액을 눌러 들어간다
    await page.goto(`/admin/users?q=${encodeURIComponent(EMAIL)}`);
    await ready(page);
    const balanceLink = page.getByRole('link', { name: /포인트 [\d,]+P$/ });
    await expect(balanceLink).toHaveCount(1);
    expect(won(await balanceLink.getAttribute('aria-label')), '목록의 잔액이 손님 화면과 다르다').toBe(start);
    await balanceLink.click();
    await page.waitForURL(/\/admin\/users\/[^/]+\/points$/);
    await ready(page);
    const userId = /\/admin\/users\/([^/]+)\/points/.exec(page.url())![1]!;

    const form = page.getByRole('form', { name: '포인트 지급 · 차감' });
    const note = `배송 지연 보상 ${Date.now()}`;

    // ── 지급: 한 번 더 보여 주고 보낸다
    await form.getByLabel('포인트', { exact: true }).fill('1234');
    await form.getByLabel('사유', { exact: true }).fill(note);
    await form.getByRole('button', { name: '확인' }).click();
    const grant = form.getByRole('group', { name: '포인트 지급 확인' }).getByRole('button', { name: '지급하기' });
    await expect(grant).toBeFocused();
    await expect(grant).toHaveAccessibleDescription(new RegExp(`${(start + 1234).toLocaleString('ko-KR')}P`));
    await grant.click();
    await expect(form.getByRole('status')).toContainText(`잔액 ${(start + 1234).toLocaleString('ko-KR')}P`, { timeout: 15_000 });
    await expect(page.getByRole('region', { name: '포인트 내역' }).getByRole('row').filter({ hasText: note })).toContainText('+1,234P');

    // ── 손님: 잔액이 늘고 내역에 사유가 그대로 보인다
    expect(await customerBalance(cp)).toBe(start + 1234);
    await expect(cp.getByText(note)).toBeVisible();

    // ── 같은 열쇠로 두 번: 한 번만 나간다
    const key = crypto.randomUUID();
    const send = () => page.request.post(`/api/admin/users/${userId}/points`, {
      data: { direction: 'GRANT', amount: 10, note: `${note} 재전송`, key },
    });
    const [first, second] = [await send(), await send()];
    expect(first.ok() && second.ok(), `재전송이 막혔다 (${first.status()}, ${second.status()})`).toBe(true);
    expect(((await second.json()) as { replayed: boolean }).replayed).toBe(true);
    expect(await customerBalance(cp), '같은 열쇠로 두 번 지급됐다').toBe(start + 1244);

    // ── 차감: 잔액보다 많으면 칸에서 막고, 맞으면 처음 잔액으로 돌아간다
    await page.reload();
    await ready(page);
    await form.getByRole('radio', { name: '차감' }).check();
    await form.getByLabel('포인트', { exact: true }).fill(String(start + 1245));
    await form.getByLabel('사유', { exact: true }).fill(`${note} 정리`);
    await form.getByRole('button', { name: '확인' }).click();
    await expect(form.getByLabel('포인트', { exact: true })).toHaveAccessibleDescription(/보다 많이 차감할 수 없습니다/);
    await expect(form.getByLabel('포인트', { exact: true })).toBeFocused();

    await form.getByLabel('포인트', { exact: true }).fill('1244');
    await form.getByRole('button', { name: '확인' }).click();
    await form.getByRole('button', { name: '차감하기' }).click();
    await expect(form.getByRole('status')).toContainText(`잔액 ${start.toLocaleString('ko-KR')}P`, { timeout: 15_000 });
    expect(await customerBalance(cp)).toBe(start);

    // ── 손님 알림함: 잔액이 왜 바뀌었는지 — 차감이 맨 위, 지급도 남아 있다(같은 열쇠 재전송은 알림도 한 번뿐)
    await cp.goto('/mypage/notifications');
    await ready(cp);
    const inbox = cp.getByRole('list', { name: '알림' }).getByRole('listitem');
    await expect(inbox.first()).toContainText('적립금 1,244P가 차감되었습니다.');
    await expect(inbox.nth(1)).toContainText('적립금 10P가 지급되었습니다.');
    await expect(inbox.nth(2)).toContainText('적립금 1,234P가 지급되었습니다.');
  } finally {
    await customer.close();
  }
});
