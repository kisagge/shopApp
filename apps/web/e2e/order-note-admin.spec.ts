import { test, expect, type Page } from '@playwright/test';
import { STATE_FILE, ready } from './state';

/**
 * 주문 내부 메모 — 운영진과 가맹점이 같은 주문에 메모를 남기고, 보는 범위가 갈린다.
 *
 * 누가 무엇을 보는지는 단위 검사가 where 로 본다. 여기서 보는 것은 **실제 화면에서 새지 않는가**다:
 * - 운영진 메모는 가맹점 화면에 안 뜬다(손님 상담 내용이 담긴다)
 * - 가맹점 메모는 운영진 화면에 가맹점 이름과 함께 뜨고, 운영진은 그것을 지울 수 없다
 * - 쓴 사람은 한 번 더 확인하고 지운다
 *
 * 가맹점(스튜디오눈) 목록의 첫 주문을 쓴다. 남긴 메모는 끝에 각자 지운다.
 */

const notesOf = (page: Page) => page.getByRole('region', { name: /^내부 메모/ });

async function leave(page: Page, text: string): Promise<void> {
  const notes = notesOf(page);
  await notes.getByLabel('메모 남기기').fill(text);
  await notes.getByRole('button', { name: '메모 남기기' }).click();
  await expect(notes.getByRole('status')).toHaveText('메모를 남겼습니다.', { timeout: 15_000 });
  await expect(notes.getByRole('listitem').filter({ hasText: text })).toHaveCount(1, { timeout: 15_000 });
}

async function remove(page: Page, text: string): Promise<void> {
  const item = notesOf(page).getByRole('listitem').filter({ hasText: text });
  await item.getByRole('button', { name: /메모 삭제$/ }).click();
  await item.getByRole('group', { name: /메모 삭제 확인$/ }).getByRole('button', { name: '지우기' }).click();
  await expect(notesOf(page).getByRole('listitem').filter({ hasText: text })).toHaveCount(0, { timeout: 15_000 });
}

test('운영진 메모는 가맹점에게 안 보이고, 가맹점 메모는 운영진에게 이름과 함께 보이며, 지우는 것은 쓴 사람만이다', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const merchant = await browser.newContext({ storageState: STATE_FILE.merchant });
  const mp = await merchant.newPage();
  const stamp = Date.now();
  const staffText = `운영 상담 메모 ${stamp} — 손님이 부재 시 경비실 요청`;
  const merchantText = `가맹점 메모 ${stamp} — 출고 하루 지연`;

  try {
    await mp.goto('/admin/orders');
    await ready(mp);
    const first = mp.locator('#main table a[href^="/admin/orders/"]').first();
    test.skip((await first.count()) === 0, '가맹점 주문이 없다');
    const orderNo = decodeURIComponent((await first.getAttribute('href'))!.split('/').pop()!);

    // ── 운영진: 메모를 남긴다 — 가맹점에게 안 보인다고 칸이 말한다
    await page.goto(`/admin/orders/${orderNo}`);
    await ready(page);
    await expect(notesOf(page).getByLabel('메모 남기기')).toHaveAccessibleDescription(/운영진 메모는 가맹점에게도 보이지 않습니다/);
    await leave(page, staffText);
    await expect(notesOf(page).getByRole('listitem').filter({ hasText: staffText })).toContainText('운영진');

    // ── 가맹점: 운영진 메모가 없다. 자기 메모를 남긴다
    await mp.goto(`/admin/orders/${orderNo}`);
    await ready(mp);
    await expect(notesOf(mp)).toBeVisible();
    await expect(mp.getByText(staffText), '운영진 상담 메모가 가맹점 화면에 떴다').toHaveCount(0);
    await expect(notesOf(mp).getByLabel('메모 남기기')).toHaveAccessibleDescription(/가맹점 메모는 운영진도 봅니다/);
    await leave(mp, merchantText);

    // ── 운영진: 가맹점 메모가 가맹점 이름과 함께 뜨고, 지울 단추는 없다
    await page.reload();
    await ready(page);
    const merchantItem = notesOf(page).getByRole('listitem').filter({ hasText: merchantText });
    await expect(merchantItem).toHaveCount(1);
    await expect(merchantItem).not.toContainText('운영진');
    await expect(merchantItem.getByRole('button', { name: /메모 삭제$/ }), '운영진이 남의 메모를 지울 수 있다').toHaveCount(0);

    // ── 각자 지운다
    await remove(mp, merchantText);
    await remove(page, staffText);
  } finally {
    await merchant.close();
  }
});
