import type { Page, TestType } from '@playwright/test';
import { ready } from './state';

/**
 * 화면이 무너졌는지를 **기하로** 잰다 — 여러 프로젝트가 함께 쓴다.
 *
 * ── 스크린샷을 안 쓰는 이유 ────────────────────────────────────
 * 픽셀 스냅숏은 글꼴 렌더링이 플랫폼마다 달라 흔들린다. 로컬(macOS)과
 * CI(Ubuntu)가 다른 답을 내면 사람은 곧 스냅숏을 갱신하는 버릇을 들이고,
 * 그러면 진짜 회귀도 함께 갱신된다. **불변식은 흔들리지 않는다** — 글자가
 * 상자 밖으로 넘쳤는가, 본문이 가로로 스크롤되는가는 어디서 재도 같다.
 *
 * ── 무엇을 잡으려고 만들었나 ──────────────────────────────────
 * 실기기에서 사람이 눈으로 찾아낸 결함 둘이 계기다.
 *   · 사이드바를 열면 검색 버튼이 오른쪽으로 밀려 잘렸다
 *   · 주문 목록의 '전체' 탭 글자가 세로로 한 자씩 쌓였다
 * 둘 다 마크업은 멀쩡했다 — axe 도, 계약도, 바이트 상한도 통과했다.
 * 자리를 재야만 보이는 것이었다.
 */

/** 재는 폭. 좁은 쪽이 늘 먼저 무너진다. */
export const WIDTHS = [320, 375, 768, 1280] as const;

/**
 * 운영 화면이 재는 폭.
 *
 * **운영 콘솔은 폰 화면을 위한 것이 아니다.** 표가 열 개 남짓한 칸을 가지고
 * 주문번호·금액·상태를 한 줄에 늘어놓는데, 그것을 320px 에 밀어 넣으면 읽을
 * 수 있는 표가 아니라 글자 기둥이 된다. 재 보니 320·375 에서 열여섯 장이 다
 * 걸렸고, 그 열여섯을 "고치는" 일은 화면을 나쁘게 만드는 쪽이었다.
 *
 * 태블릿(768)은 다르다. 운영자가 실제로 그 폭에서 열어 볼 수 있고, 재 보니
 * 고칠 값어치가 있는 결함이 실제로 둘 있었다.
 */
export const ADMIN_WIDTHS = [768, 1280] as const;

export interface LayoutProblem {
  readonly kind: string;
  readonly detail: string;
}

/**
 * 이 화면의 지금 상태에서 어긋난 것들.
 *
 * **낭독기 전용으로 접어 둔 것은 세지 않는다**(sr-only 는 1px 상자에
 * clip-path 로 잘라 둔 것이라, 잘렸다고 세면 모든 화면이 걸린다).
 */
export async function layoutProblems(page: Page): Promise<LayoutProblem[]> {
  return page.evaluate(() => {
    const out: { kind: string; detail: string }[] = [];
    const de = document.documentElement;

    // 본문이 가로로 스크롤되면 좁은 화면에서 글이 화면 밖으로 나간다
    if (de.scrollWidth > de.clientWidth + 1) {
      out.push({ kind: '가로스크롤', detail: `${de.scrollWidth} > ${de.clientWidth}` });
    }

    const CANDIDATES = 'button, a, th, td, label, span, p, h1, h2, h3, li, legend';
    for (const el of document.querySelectorAll<HTMLElement>(CANDIDATES)) {
      const text = (el.textContent ?? '').trim();
      if (!text || el.children.length > 0) continue;

      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;

      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      // 낭독기 전용(sr-only)은 일부러 접어 둔 것이다
      if (r.width <= 2 || r.height <= 2 || cs.clipPath !== 'none') continue;

      const scrolls = cs.overflowX === 'auto' || cs.overflowX === 'scroll';
      if (!scrolls && el.scrollWidth > el.clientWidth + 1) {
        out.push({
          kind: '글자잘림',
          detail: `<${el.tagName.toLowerCase()}> "${text.slice(0, 24)}" ${el.scrollWidth}>${el.clientWidth}`,
        });
      }

      /*
       * 글자가 자기 상자보다 **세로로** 길다.
       *
       * flex 자식이 줄어들지 못하게 막아 두지 않으면 상자가 글자 폭까지
       * 눌리고, 한글은 한 자씩 줄바꿈되어 세로로 선다. 주문 탭이 그랬다 —
       * 높이 44px 상자 안에서 글자가 61px 이었다.
       *
       * 처음에는 "상자가 글자 두 자보다 좁으면" 같은 어림으로 잡으려 했는데
       * 실제로 재 보니 탭은 36px 이라 그 그물을 빠져나갔다. 넘쳤는지는
       * 어림잡을 것 없이 그대로 물어보면 된다.
       */
      /*
       * **한 줄이 더 생겼을 때만 센다.**
       *
       * 제목 글자는 상자보다 2px쯤 튀어나오는 일이 흔하다 — 줄 높이와 상자
       * 높이가 딱 떨어지지 않아서지 줄바꿈이 아니다. 그것까지 세면 멀쩡한
       * 홈·카테고리가 걸린다. 실제로 그랬다(37>35, 34>32).
       *
       * 진짜 줄바꿈은 줄 높이만큼 넘친다 — 탭이 61>44 였고 줄 높이는 20px 다.
       * 그 사이를 가르는 자리를 줄 높이의 절반으로 둔다.
       */
      const lineHeight = Number.parseFloat(cs.lineHeight) || 16;
      const overflowY = el.scrollHeight - el.clientHeight;
      const scrollsY = cs.overflowY === 'auto' || cs.overflowY === 'scroll';
      if (!scrollsY && overflowY >= lineHeight / 2) {
        out.push({
          kind: '세로넘침',
          detail: `<${el.tagName.toLowerCase()}> "${text.slice(0, 16)}" ${el.scrollHeight}>${el.clientHeight}`,
        });
      }
    }
    return out;
  });
}

/** 화면 목록을 폭마다 훑는다. `open` 은 재기 전에 화면을 그 상태로 만든다. */
export function layoutTests(
  test: TestType<any, any>,
  expect: (actual: unknown, message?: string) => { toEqual(expected: unknown): void },
  pages: ReadonlyArray<readonly [label: string, path: string, open?: (page: Page) => Promise<void>]>,
  widths: readonly number[] = WIDTHS,
): void {
  for (const width of widths) {
    for (const [label, path, open] of pages) {
      test(`${label} — ${width}px 에서 자리가 무너지지 않는다`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });

        /*
         * **눌러야 하는 화면은 하이드레이션을 기다린다.** 읽기만 하는 검사는
         * DOM 까지만 기다려도 되지만(사진을 기다리면 CI 에서 느리다), 버튼을
         * 누르는 검사에서 그렇게 하면 버튼이 아직 반응하지 않는다.
         */
        if (open) {
          await page.goto(path);
          await ready(page);
          await open(page);
        } else {
          await page.goto(path, { waitUntil: 'domcontentloaded' });
        }

        const problems = await layoutProblems(page);

        expect(
          problems,
          `${label} ${width}px 에서 자리가 어긋났다.\n` +
            problems.map((p) => `  · ${p.kind}: ${p.detail}`).join('\n'),
        ).toEqual([]);
      });
    }
  }
}
