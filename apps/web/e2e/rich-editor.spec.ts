import { test, expect } from '@playwright/test';
import { STATE_FILE, ready } from './state';

/**
 * 공지 편집기를 눌러 본다.
 *
 * **눌렀는지 알 수 없는 토글은 토글이 아니다.** 굵게를 눌러도 단추가 그대로
 * 있다가 글자를 한 자 치고 나서야 켜진 것으로 보였다 — 쓰는 사람은 눌리지
 * 않았다고 여기고 한 번 더 누르고, 그러면 다시 꺼진다.
 *
 * 원인은 TipTap 3 가 트랜잭션마다 컴포넌트를 다시 그리지 않는다는 것이었다
 * (2 에서 바뀐 점이다). 그리는 김에 `isActive` 를 읽던 코드가 새 값을 못 봤다.
 * 고쳐 두어도 다음 판올림에서 같은 자리가 다시 어긋날 수 있으므로 검사로
 * 남긴다 — **글자를 치지 않고** 눌린 상태가 보이는지 본다.
 */

test.use({ storageState: STATE_FILE.admin });
test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await page.goto('/admin/support');
  await ready(page);
  // 편집기는 열어 볼 때 받아 오므로 붙을 때까지 기다린다
  await page.locator('#admin-nav-panel').waitFor();
  await page.getByRole('toolbar', { name: '글자 서식' }).waitFor();
});

test('굵게를 누르면 글자를 치기 전에 켜진 것이 보인다', async ({ page }) => {
  const body = page.getByRole('toolbar', { name: '글자 서식' });
  const bold = body.getByRole('button', { name: '굵게' });

  await expect(bold).toHaveAttribute('aria-pressed', 'false');
  await bold.click();

  // 한 글자도 치지 않는다 — 그것이 이 검사의 전부다
  await expect(bold).toHaveAttribute('aria-pressed', 'true');
});

test('다시 누르면 꺼진다', async ({ page }) => {
  const bold = page.getByRole('toolbar', { name: '글자 서식' }).getByRole('button', { name: '굵게' });
  await bold.click();
  await expect(bold).toHaveAttribute('aria-pressed', 'true');
  await bold.click();
  await expect(bold).toHaveAttribute('aria-pressed', 'false');
});

test('제목과 목록도 누른 자리가 보인다', async ({ page }) => {
  const toolbar = page.getByRole('toolbar', { name: '글자 서식' });

  const heading = toolbar.getByRole('button', { name: '제목1' });
  await heading.click();
  await expect(heading).toHaveAttribute('aria-pressed', 'true');

  const list = toolbar.getByRole('button', { name: '글머리' });
  await list.click();
  await expect(list).toHaveAttribute('aria-pressed', 'true');
  // 제목이던 줄이 목록이 되었으니 제목은 꺼져 있어야 한다
  await expect(heading).toHaveAttribute('aria-pressed', 'false');
});

test('편집 영역은 이름과 역할을 가진 칸이다', async ({ page }) => {
  /*
   * `contenteditable` 만으로는 접근성 트리에 이름도 역할도 없는 generic 이다.
   * 낭독기로 폼을 훑으면 제목 다음이 곧바로 고정 체크박스라, 본문 칸이 아예
   * 없는 것처럼 들렸다.
   */
  const body = page.getByRole('textbox', { name: '내용' });
  await expect(body).toBeVisible();
  await expect(body).toHaveAttribute('aria-multiline', 'true');
});
