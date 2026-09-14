import { test, expect } from '@playwright/test';
import { contrastProblems } from './contrast';
import { STATE_FILE, ready } from './state';

/**
 * 운영 화면도 어두운 화면에서 읽힌다.
 *
 * **운영 화면이 더 잘 무너진다.** 손님 화면보다 고정 뉴트럴(`border-n-300`
 * 같은 것)을 훨씬 많이 쓰고, 표와 배지처럼 색으로 구분하는 것이 빽빽하다.
 * 그리고 매일 열어 보는 사람이 있는 화면이다.
 *
 * 재는 방법과 그 한계는 `contrast.ts` 에 적어 두었다.
 */

test.use({ storageState: STATE_FILE.admin });

const PAGES = [
  ['대시보드', '/admin'],
  ['주문', '/admin/orders'],
  ['상품', '/admin/products'],
  ['정산', '/admin/settlements'],
  ['회원', '/admin/users'],
  ['공지·FAQ', '/admin/support'],
  ['배송비', '/admin/shipping'],
  ['알림', '/admin/notifications'],
  ['감사 로그', '/admin/audit'],
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
  });
}
