import { test, expect } from '@playwright/test';
import { ready } from './state';
import { budgetTests } from './bundle';

/**
 * 손님 화면이 받는 자바스크립트의 상한.
 *
 * 계약 패키지는 Zod 를 끌고 온다. 그 안의 상수 하나를 브라우저 쪽에서
 * import 하면 **384KB 가 통째로 딸려 오고**, 그게 루트 레이아웃에 있으면
 * 폼이 하나도 없는 화면까지 받는다. 실제로 그랬다 — 모든 화면이 1.2MB 였다.
 *
 * **눈으로는 아무 차이도 안 보인다.** 화면은 똑같이 잘 뜨고, 느린 회선에서만
 * 드러난다. 그래서 바이트로 못 박아 둔다 — 다시 딸려 오면 상한을 넘는다.
 *
 * 로그인이 필요한 화면은 bundle-budget-customer / -admin 이 잰다. 그 둘이
 * 없던 동안 결제 화면만 Zod 를 받고 있었고 여기서는 보이지 않았다.
 */
budgetTests(test, expect, ['/', '/signup', '/cart', '/support']);

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
