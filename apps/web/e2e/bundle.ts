import type { Page, Response } from '@playwright/test';

/**
 * 화면이 받는 정적 자원의 상한 — 여러 프로젝트가 함께 쓴다.
 *
 * 손님 화면은 bundle-budget.spec.ts(guest), 로그인이 필요한 화면은
 * bundle-budget-customer / -admin 이 쓴다. **상한을 한 군데 두는 이유**는
 * 처음에 손님 화면 네 개만 재고 있었기 때문이다 — 결제 화면이 목록에 없어서
 * Zod 398KB 가 되돌아온 것을 아무도 못 봤다.
 */

/**
 * 넉넉히 잡되 384KB 가 되돌아오면 걸리는 자리.
 *
 * 지금은 화면당 676~730KB 다. 여유를 두되, 계약이 다시 딸려 오면
 * 1,060KB 를 넘겨 걸린다.
 */
export const BUDGET_KB = 800;

/**
 * 스타일 상한.
 *
 * 처음 쟀을 때 화면마다 451KB 였는데 **그중 412KB 가 스타일이 아니라
 * `@font-face` 선언**이었다. 한글 글꼴은 수백 개 조각으로 쪼개져 오고 굵기마다
 * 그 조각 전부에 선언이 하나씩 붙는다 — 쓰지도 않는 굵기 하나가 수십 KB 다.
 * 실제 앱 스타일은 48KB 뿐이었다.
 */
export const CSS_BUDGET_KB = 300;

/**
 * 글꼴 상한.
 *
 * **선언만 재고 파일은 안 재고 있었다.** 위 스타일 상한이 @font-face 선언의
 * 무게를 잡아 주는 사이, 정작 내려받는 글꼴 파일은 아무도 안 보고 있었다.
 * 재 보니 매대 한 화면이 208개 1,833KB 를 받았고 그중 실제로 쓰는 것은
 * 35개 334KB 였다 — 미리 받기가 화면에 없는 글자의 조각까지 끌어온 것이다.
 *
 * 지금은 화면마다 300~400KB 다. 미리 받기가 다시 켜지면 네 배가 되어 걸린다.
 */
export const FONT_BUDGET_KB = 600;

export async function staticKB(
  page: Page,
  path: string,
  ext: '.js' | '.css' | '.woff2',
): Promise<number> {
  const bytes = new Map<string, number>();
  const onResponse = async (response: Response) => {
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

/** 화면 목록 하나로 스크립트·스타일 두 검사를 만든다 */
export function budgetTests(
  test: typeof import('@playwright/test').test,
  expect: typeof import('@playwright/test').expect,
  paths: readonly string[],
  before?: (page: Page) => Promise<void>,
): void {
  for (const path of paths) {
    test(`${path} 가 받는 스크립트가 상한 안에 있다`, async ({ page }) => {
      await before?.(page);
      const kb = await staticKB(page, path, '.js');
      expect(kb, `${path} 가 스크립트 ${Math.round(kb)}KB 를 받는다`).toBeLessThan(BUDGET_KB);
    });

    test(`${path} 가 받는 스타일이 상한 안에 있다`, async ({ page }) => {
      await before?.(page);
      const kb = await staticKB(page, path, '.css');
      expect(kb, `${path} 가 스타일 ${Math.round(kb)}KB 를 받는다`).toBeLessThan(CSS_BUDGET_KB);
    });

    test(`${path} 가 받는 글꼴이 상한 안에 있다`, async ({ page }) => {
      await before?.(page);
      const kb = await staticKB(page, path, '.woff2');
      expect(kb, `${path} 가 글꼴 ${Math.round(kb)}KB 를 받는다`).toBeLessThan(FONT_BUDGET_KB);
    });
  }
}
