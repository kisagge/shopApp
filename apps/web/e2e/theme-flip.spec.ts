import { test, expect } from '@playwright/test';
import { themeFlipProblems } from './contrast';

/**
 * 선이 테마를 따라 바뀐다.
 *
 * **명암비 검사가 못 보는 자리가 있다.** `border-n-300` 은 밝은 화면에서
 * 1.5:1 짜리 잔잔한 선인데, 저울의 눈금이라 어두운 화면에서도 같은 값이다 —
 * 그 자리에서는 12:1 짜리 **흰 선**이 된다. 글자가 아니니 명암비에 안 걸리고
 * 자리도 안 무너지는데, 눈에는 제일 먼저 들어온다. 로그인 화면의 입력 칸이
 * 어두운 배경 위에서 형광펜처럼 빛났다.
 *
 * 값을 견주지 않고 **역할**을 견준다 — 자세한 이유는 `contrast.ts` 에 적었다.
 */

const PAGES = [
  ['홈', '/'],
  ['상품 상세', '/product/oversized-wool-coat'],
  ['장바구니', '/cart'],
  ['로그인', '/login'],
  ['회원가입', '/signup'],
  ['고객센터', '/support'],
] as const;

for (const [label, path] of PAGES) {
  test(`${label} 의 선이 두 테마에서 같은 역할을 한다`, async ({ page }) => {
    const problems = await themeFlipProblems(page, path);

    expect(
      problems.map((p) => `${p.what} 밝은 ${p.light}:1 → 어두운 ${p.dark}:1`),
      `${label} — 테마를 안 타는 선이 있다`,
    ).toEqual([]);
  });
}
