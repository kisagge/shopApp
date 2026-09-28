import { test, expect, type Page } from '@playwright/test';
import { ready } from './state';

/**
 * 회원정보 수정 · 비밀번호 변경 — 새로 가입한 계정으로 끝까지.
 *
 * 공유 계정의 비밀번호를 바꾸면 그 계정으로 로그인하는 다른 검사가 전부 진다. 그래서 **매번 새로 가입한다**(가입
 * 검사와 같다). 여기서 보는 것:
 * - 이름을 바꾸면 머리의 이름이 곧바로 바뀐다(세션 쿠키를 다시 굽는다)
 * - 연락처는 서버가 맞춘 모양으로 저장되어 다시 열어도 그대로다
 * - 틀린 지금 비밀번호는 그 칸에서 막히고, 바꾼 뒤에는 **새 비밀번호로만** 들어온다
 */

test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ mode: 'serial' });

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await ready(page);
  await page.getByLabel('이메일').fill(email);
  await page.getByLabel('비밀번호').fill(password);
  await page.getByRole('button', { name: '로그인' }).click();
}

test('이름·연락처를 고치고 비밀번호를 바꾸면, 머리 이름이 바뀌고 새 비밀번호로만 들어온다', async ({ page }) => {
  test.setTimeout(90_000);
  const email = `e2e-account-${Date.now()}@plain.test`;
  const original = 'quiet-harbor-42';
  const changed = 'silver-meadow-77';

  await page.goto('/signup');
  await ready(page);
  await page.getByLabel(/^이메일/).fill(email);
  await page.getByLabel(/^이름/).fill('설정 검사');
  await page.getByLabel(/^비밀번호\*/).fill(original);
  await page.getByLabel(/^비밀번호 확인/).fill(original);
  // 필수 동의 — 폼이 칸 검사보다 먼저 본다
  await page.getByLabel(/이용약관에 동의합니다/).check();
  await page.getByLabel(/개인정보 수집/).check();
  await page.getByRole('button', { name: '가입하기' }).click();
  await expect(page.getByRole('link', { name: '마이페이지' })).toBeVisible();

  // ── 마이페이지 메뉴에서 들어간다
  await page.goto('/mypage');
  await ready(page);
  await page.getByRole('link', { name: '회원정보 수정' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '회원정보' })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();

  // ── 이름·연락처
  const profile = page.getByRole('region', { name: '기본 정보' });

  /*
   * ── 이메일 인증: 막 가입한 주소는 인증 전이고, 인증 메일을 다시 받을 수 있다. 예전에는 가입할 때 한 번 나가고
   * 끝이라 지운 사람은 받을 길이 없었고, 인증했는지조차 손님 화면에 보이지 않았다.
   */
  await expect(profile.getByText('인증 전', { exact: true })).toBeVisible();
  await profile.getByRole('button', { name: '인증 메일 다시 보내기' }).click();
  await expect(profile.getByRole('status').filter({ hasText: '인증 메일' }))
    .toHaveText('인증 메일을 보냈습니다. 메일함을 확인해 주세요.', { timeout: 15_000 });

  await profile.getByLabel(/^이름/).fill('바뀐 이름');
  await profile.getByLabel(/^연락처/).fill('01098765432');
  await profile.getByRole('button', { name: '저장' }).click();
  // 인증 안내도 같은 칸에서 결과를 말한다 — 저장 결과만 골라 본다
  await expect(profile.getByRole('status').filter({ hasText: '회원정보' })).toHaveText('회원정보를 저장했습니다.');
  await expect(page.getByRole('banner').getByText('바뀐 이름', { exact: true }).locator('visible=true')).toHaveCount(1);

  await page.reload();
  await ready(page);
  await expect(profile.getByLabel(/^연락처/)).toHaveValue('010-9876-5432');

  // ── 비밀번호: 틀린 지금 비밀번호는 그 칸에서
  const password = page.getByRole('region', { name: '비밀번호 변경' });
  await password.getByLabel(/^지금 비밀번호/).fill('wrong-pass-00');
  await password.getByLabel(/^새 비밀번호\*/).fill(changed);
  await password.getByLabel(/^새 비밀번호 확인/).fill(changed);
  await password.getByRole('button', { name: '비밀번호 바꾸기' }).click();
  await expect(password.getByText('지금 비밀번호가 맞지 않습니다.')).toBeVisible();
  await expect(password.getByLabel(/^지금 비밀번호/)).toHaveAttribute('aria-invalid', 'true');

  await password.getByLabel(/^지금 비밀번호/).fill(original);
  await password.getByRole('button', { name: '비밀번호 바꾸기' }).click();
  await expect(password.getByRole('status')).toContainText('비밀번호를 바꿨습니다');

  // ── 로그아웃 뒤: 옛 비밀번호는 안 되고 새 비밀번호는 된다
  await page.getByRole('button', { name: '로그아웃' }).click();
  await expect(page.getByRole('link', { name: '로그인' }).first()).toBeVisible();

  await login(page, email, original);
  await expect(page.locator('form [role="alert"]')).toContainText('이메일 또는 비밀번호');

  await login(page, email, changed);
  await expect(page.getByRole('link', { name: '마이페이지' })).toBeVisible();
  await expect(page.getByRole('banner').getByText('바뀐 이름', { exact: true }).locator('visible=true')).toHaveCount(1);
});

/**
 * **끈 것이 이 기기에만 남았다.**
 *
 * 수집 창구는 계정의 거부를 존중하는데, 그 값을 만드는 곳이 탈퇴 처리뿐이라 화면의 토글은 이 브라우저의
 * 저장소만 건드렸다 — 기기나 브라우저를 바꾸면 껐던 추적이 조용히 되살아났다. 마케팅 동의는 진작 계정에
 * 저장하고 있어 일관성도 어긋났다.
 *
 * 그래서 **저장소를 통째로 버린 새 브라우저**로 다시 들어와 본다. 계정에 남지 않았다면 여기서 다시 "수집 중" 이
 * 된다 — 이 검사가 잡으려는 것이 바로 그 자리다.
 */
test('이용 기록 수집을 끄면 다른 브라우저로 들어와도 꺼져 있다', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const email = `e2e-consent-${Date.now()}@plain.test`;
  const password = 'quiet-harbor-42';

  await page.goto('/signup');
  await ready(page);
  await page.getByLabel(/^이메일/).fill(email);
  await page.getByLabel(/^이름/).fill('동의 검사');
  await page.getByLabel(/^비밀번호\*/).fill(password);
  await page.getByLabel(/^비밀번호 확인/).fill(password);
  await page.getByLabel(/이용약관에 동의합니다/).check();
  await page.getByLabel(/개인정보 수집/).check();
  await page.getByRole('button', { name: '가입하기' }).click();
  await expect(page.getByRole('link', { name: '마이페이지' })).toBeVisible();

  // ── 끈다. 저장을 기다린다 — 단추 글자만 보고 넘어가면 아직 안 적혔을 수 있다
  await page.goto('/mypage');
  await ready(page);
  const [saved] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'PATCH' && r.url().includes('/api/account/consent')),
    page.getByRole('button', { name: '수집 그만두기' }).click(),
  ]);
  expect(saved.status(), await saved.text()).toBe(200);
  await expect(page.getByText('수집하지 않음')).toBeVisible();

  // ── 저장소를 통째로 버린 브라우저로 다시
  const fresh = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  try {
    const fp = await fresh.newPage();
    await login(fp, email, password);
    await expect(fp.getByRole('link', { name: '마이페이지' })).toBeVisible({ timeout: 20_000 });
    await fp.goto('/mypage');
    await ready(fp);

    await expect(fp.getByText('수집하지 않음'), '계정에 안 남아 껐던 추적이 되살아났다').toBeVisible();
    await expect(fp.getByRole('button', { name: '수집 허용하기' })).toBeVisible();
  } finally {
    await fresh.close();
  }
});

/**
 * 회원 탈퇴를 **실제로 눌러 본다.**
 *
 * 지우는 코드는 203줄인데(PII 익명화, 정산 근거 보존, 세션 무효화) 선 서버에서 눌린 적이 한 번도 없었다 —
 * 손님 검사는 "실제로 누르지는 않는다 — 시드 계정이 사라지면 나머지 시험이 무너진다" 며 문구 입력까지만 봤다.
 * 여기서는 이 검사만 쓰는 계정을 그 자리에서 만들어 끝까지 간다.
 *
 * 개인정보가 걸린 자리라 새면 비용이 크다. 화면에서 확인할 수 있는 것을 본다:
 * 들고 있던 세션이 곧바로 끊기는가, 같은 열쇠로 다시 들어올 수 없는가, 그리고 **그 이메일이 풀려 있는가** —
 * 계정을 지웠다면 같은 주소로 다시 가입할 수 있어야 한다.
 */
test('탈퇴하면 세션이 끊기고, 같은 열쇠로는 못 들어오며, 그 이메일로 다시 가입할 수 있다', async ({ page }) => {
  test.setTimeout(120_000);
  const email = `e2e-close-${Date.now()}@plain.test`;
  const password = 'quiet-harbor-42';

  const signUp = async (name: string): Promise<void> => {
    await page.goto('/signup');
    await ready(page);
    await page.getByLabel(/^이메일/).fill(email);
    await page.getByLabel(/^이름/).fill(name);
    await page.getByLabel(/^비밀번호\*/).fill(password);
    await page.getByLabel(/^비밀번호 확인/).fill(password);
    await page.getByLabel(/이용약관에 동의합니다/).check();
    await page.getByLabel(/개인정보 수집/).check();
    await page.getByRole('button', { name: '가입하기' }).click();
    await expect(page.getByRole('link', { name: '마이페이지' })).toBeVisible({ timeout: 20_000 });
  };

  await signUp('탈퇴 검사');

  // ── 탈퇴. 되돌릴 수 없는 동작이라 문구를 옮겨 적기 전에는 누를 수 없다
  await page.goto('/mypage/close');
  await ready(page);
  const submit = page.getByRole('button', { name: '탈퇴하기' });
  await expect(submit).toBeDisabled();
  await page.getByRole('textbox').fill('탈퇴합니다');
  await submit.click();
  await page.waitForURL(/\/account\/closed$/, { timeout: 20_000 });

  // ── 들고 있던 세션이 곧바로 끊긴다. 쿠키가 남아 있어도 열리면 안 된다
  await page.goto('/mypage');
  await page.waitForURL(/\/login/);

  // ── 같은 열쇠로는 못 들어온다(연결된 계정이 지워졌다)
  await login(page, email, password);
  await expect(page.getByRole('link', { name: '마이페이지' })).toHaveCount(0);
  expect(new URL(page.url()).pathname, '탈퇴한 계정으로 들어와졌다').toBe('/login');

  // ── 그 이메일은 풀려 있다 — 지웠다면 같은 주소로 다시 시작할 수 있어야 한다
  await signUp('다시 온 손님');
  await page.goto('/mypage');
  await ready(page);
  await expect(page.locator('#main')).toContainText('다시 온 손님');
});

/**
 * **꺼 둔 스위치가 지켜지는가.**
 *
 * 마케팅 수신 스위치는 값을 계정에 적고 있었는데, 그 값을 **읽는 곳이 하나도 없었다.** 소멸 안내를
 * 보내는 배치가 동의를 보지 않아, 꺼 둔 사람에게도 쿠폰·적립금 메일이 매일 그대로 나갔다.
 *
 * 메일이 나가는지는 배치를 돌려 봐야 아는 것이라 검사는 따로 있다(expiry-notice). 여기서는 화면 쪽을
 * 본다 — **끈 것이 남는가.** 남지 않으면 배치가 아무리 잘 봐도 소용이 없다.
 */
test('마케팅 수신을 끄면 다시 들어와도 꺼져 있다', async ({ page }) => {
  test.setTimeout(90_000);
  const email = `e2e-marketing-${Date.now()}@plain.test`;
  const password = 'quiet-harbor-42';

  // 가입할 때 받겠다고 고른다 — 끄는 것을 보려면 켜져 있어야 한다
  await page.goto('/signup');
  await ready(page);
  await page.getByLabel(/^이메일/).fill(email);
  await page.getByLabel(/^이름/).fill('수신 검사');
  await page.getByLabel(/^비밀번호\*/).fill(password);
  await page.getByLabel(/^비밀번호 확인/).fill(password);
  await page.getByLabel(/이용약관에 동의합니다/).check();
  await page.getByLabel(/개인정보 수집/).check();
  await page.getByLabel(/할인·혜택 소식/).check();
  await page.getByRole('button', { name: '가입하기' }).click();
  await expect(page.getByRole('link', { name: '마이페이지' })).toBeVisible();

  const section = () => page.getByRole('region', { name: '혜택 소식 받기' });

  await page.goto('/mypage');
  await ready(page);
  await expect(section().getByText('받는 중'), '가입에서 고른 수신 동의가 안 남았다').toBeVisible();

  // ── 끈다. 저장을 기다린다 — 단추 글자만 보고 넘어가면 아직 안 적혔을 수 있다
  const [saved] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'PATCH' && r.url().includes('/api/account/consent')),
    section().getByRole('button', { name: '그만 받기', exact: true }).click(),
  ]);
  expect(saved.status(), await saved.text()).toBe(200);
  await expect(section().getByText('받지 않음')).toBeVisible();

  // 새로 그린 화면이 같은 말을 해야 한다 — 계정에 안 남았다면 여기서 "받는 중" 으로 돌아온다
  await page.reload();
  await ready(page);
  await expect(
    section().getByText('받지 않음'),
    '껐는데 다시 들어오니 켜져 있다 — 계정에 안 남았다',
  ).toBeVisible();
});
