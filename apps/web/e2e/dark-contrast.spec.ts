import { test, expect } from '@playwright/test';
import { contrastProblems } from './contrast';
import { ready } from './state';

/**
 * 어두운 화면에서도 글자가 읽힌다.
 *
 * **테마는 토큰만 바꾼다.** `--fg`·`--surface` 같은 것은 어두운 화면에서 다른
 * 값으로 갈아 끼우는데, 그 옆에서 `text-n-500` 처럼 **저울의 눈금을 직접
 * 부른 자리**는 그대로 남는다. 밝은 바탕에서 고른 회색이 어두운 바탕에서는
 * 바닥에 가라앉는다 — 매대의 정가(취소선)가 그랬다.
 *
 * 토큰끼리의 짝은 `packages/ui` 의 `tokens.contrast.test.ts` 가 이미 잰다.
 * **여기서 재는 것은 화면에 실제로 칠해진 색**이라, 토큰을 안 쓴 자리까지
 * 함께 걸린다. 둘이 짝이다.
 *
 * 밝은 화면도 함께 잰다. 어두운 쪽만 재면 "어두운 화면에서만 되는" 색을
 * 고치고 밝은 쪽을 깨뜨려도 모른다.
 */

const PAGES = [
  ['홈', '/'],
  ['카테고리', '/category/outer'],
  ['상품 상세', '/product/oversized-wool-coat'],
  ['검색', '/search?q=코트'],
  ['기획전', '/collections'],
  ['장바구니', '/cart'],
  ['로그인', '/login'],
  ['회원가입', '/signup'],
  ['고객센터', '/support'],
] as const;

for (const scheme of ['dark', 'light'] as const) {
  test.describe(scheme === 'dark' ? '어두운 화면' : '밝은 화면', () => {
    test.use({ colorScheme: scheme });

    for (const [label, path] of PAGES) {
      test(`${label} 의 글자가 읽힌다`, async ({ page }) => {
        await page.goto(path);
        await ready(page);

        const problems = await contrastProblems(page);

        expect(
          problems.map((p) => `${p.ratio}:1 (${p.need} 필요) ${p.what}`),
          `${label} — 명암비가 모자란 글자가 있다`,
        ).toEqual([]);
      });
    }

    test('재고 있다 — 아무것도 못 읽으면 위가 전부 헛돈다', async ({ page }) => {
      await page.goto('/');
      await ready(page);

      /*
       * 색을 못 읽으면 문제 목록이 언제나 비고, 위 검사는 무엇을 넣어도
       * 통과한다. 일부러 못 읽을 색을 심어 **잡히는지** 본다.
       */
      await page.evaluate(() => {
        const bait = document.createElement('p');
        bait.textContent = '읽을 수 없는 글자';
        bait.style.cssText = 'color:#6b6b6b;background:#717171;font-size:14px;padding:8px';
        document.body.append(bait);
      });

      const problems = await contrastProblems(page);
      expect(problems.some((p) => p.what.includes('읽을 수 없는 글자'))).toBe(true);
    });
  });
}
