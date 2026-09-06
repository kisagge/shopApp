import { test, expect } from '@playwright/test';
import { ready } from './state';

/**
 * 화면이 받는 자바스크립트의 상한.
 *
 * 계약 패키지는 Zod 를 끌고 온다. 그 안의 상수 하나를 브라우저 쪽에서
 * import 하면 **384KB 가 통째로 딸려 오고**, 그게 루트 레이아웃에 있으면
 * 폼이 하나도 없는 화면까지 받는다. 실제로 그랬다 — 모든 화면이 1.2MB 였다.
 *
 * **눈으로는 아무 차이도 안 보인다.** 화면은 똑같이 잘 뜨고, 느린 회선에서만
 * 드러난다. 그래서 바이트로 못 박아 둔다 — 다시 딸려 오면 상한을 넘는다.
 */

/**
 * 넉넉히 잡되 384KB 가 되돌아오면 걸리는 자리.
 *
 * 지금은 화면당 676~712KB 다. 여유를 두되, 계약이 다시 딸려 오면
 * 1,060KB 가 되어 넘는다.
 */
const BUDGET_KB = 800;

/**
 * 스타일 상한.
 *
 * 처음 쟀을 때 화면마다 451KB 였는데 **그중 412KB 가 스타일이 아니라
 * `@font-face` 선언**이었다. 한글 글꼴은 수백 개 조각으로 쪼개져 오고 굵기마다
 * 그 조각 전부에 선언이 하나씩 붙는다 — 쓰지도 않는 굵기 하나가 수십 KB 다.
 * 실제 앱 스타일은 48KB 뿐이었다.
 */
const CSS_BUDGET_KB = 300;

async function staticKB(
  page: import('@playwright/test').Page,
  path: string,
  ext: '.js' | '.css',
): Promise<number> {
  const bytes = new Map<string, number>();
  const onResponse = async (response: import('@playwright/test').Response) => {
    // 스크립트와 스타일은 같은 폴더에 있다 — 섞어 세면 어느 쪽이 는지 알 수 없다
    if (!response.url().includes('/_next/static/') || !response.url().endsWith(ext)) return;
    try {
      bytes.set(response.url(), (await response.body()).byteLength);
    } catch {
      // 리다이렉트처럼 몸통이 없는 응답은 셀 것이 없다
    }
  };

  /*
   * **load 까지만 센다.** 그 뒤로는 Next 가 화면에 보이는 링크의 조각을
   * 미리 받는데, 그건 다음 화면을 위한 것이라 이 화면이 뜨는 데 든 값이
   * 아니다. networkidle 까지 기다렸더니 그것까지 합산돼 1,126KB 가 나왔다.
   */
  page.on('response', onResponse);
  await page.goto(path, { waitUntil: 'load' });
  page.off('response', onResponse);

  return [...bytes.values()].reduce((sum, n) => sum + n, 0) / 1024;
}

for (const path of ['/', '/signup', '/cart', '/support']) {
  test(`${path} 가 받는 스크립트가 상한 안에 있다`, async ({ page }) => {
    const kb = await staticKB(page, path, '.js');
    expect(kb, `${path} 가 스크립트 ${Math.round(kb)}KB 를 받는다`).toBeLessThan(BUDGET_KB);
  });

  test(`${path} 가 받는 스타일이 상한 안에 있다`, async ({ page }) => {
    const kb = await staticKB(page, path, '.css');
    expect(kb, `${path} 가 스타일 ${Math.round(kb)}KB 를 받는다`).toBeLessThan(CSS_BUDGET_KB);
  });
}

test('가입 폼은 보내기 전에 스스로 거른다', async ({ page }) => {
  /*
   * 검증 스키마를 늦게 받도록 바꿨다. 조용히 실패해도 서버가 잡아 주므로
   * **화면이 먼저 거르는지는 여기서만 확인된다.**
   */
  await page.goto('/signup');
  await ready(page);
  await page.getByLabel(/^이메일/).fill('e2e-mismatch@plain.test');
  await page.getByLabel(/^이름/).fill('불일치 테스트');
  await page.getByLabel(/^비밀번호\*/).fill('quiet-harbor-42');
  await page.getByLabel(/^비밀번호 확인/).fill('다른-비밀번호-99');

  let sent = false;
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().includes('/api/auth')) sent = true;
  });

  await page.getByRole('button', { name: '가입하기' }).click();

  await expect(page.getByText('비밀번호가 일치하지 않습니다')).toBeVisible();
  expect(sent, '거를 것을 서버까지 보내지 않는다').toBe(false);
});
