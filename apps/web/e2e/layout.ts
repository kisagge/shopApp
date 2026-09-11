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
 * **한 번 물러섰다가 되돌렸다.** 처음에는 768·1280 만 쟀다 — "운영 콘솔은
 * 폰 화면을 위한 것이 아니다" 라는 이유였고, 320·375 에서 열여섯 장이 다
 * 걸렸는데 그때의 화면으로는 고치는 일이 화면을 나쁘게 만드는 쪽이었다.
 *
 * 그런데 그 진단이 반쯤 틀렸다. 열여섯 장이 다 걸린 **진짜 이유는 표가
 * 아니라 메뉴**였다. 사이드바가 232px 을 늘 차지해서 본문에 143px 밖에 안
 * 남았고, 그러니 무엇을 넣어도 무너졌다. 메뉴를 접으니 남는 문제는 표 몇
 * 개였고, 그건 가로 스크롤로 답할 수 있는 문제다.
 *
 * 그리고 폰은 실제로 쓰인다 — 주문이 들어오는 것을 보는 사람은 책상 앞이
 * 아니라 폰을 들고 있다.
 *
 * 320 은 여전히 안 잰다. 그 폭에서 표를 읽을 방법은 없고, 손님 화면과 달리
 * 운영 화면은 "그 기기에서 꼭 되어야" 하는 것이 아니다.
 */
export const ADMIN_WIDTHS = [375, 768, 1280] as const;

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
      /*
       * **짧은 말이 여러 줄로 섰다.**
       *
       * 아래 '세로넘침' 은 글자가 **상자 밖으로 나갔을 때**만 잡는다. 그런데
       * 상자가 넉넉하면 글자는 넘치지 않고 그냥 줄줄이 선다 — 공지 편집기의
       * 라벨 "주소" 와 단추 "적용" 이 높이 32px 상자 안에서 한 자씩 두 줄로
       * 서 있었고, 28px 이라 넘치지 않았으니 아무 검사도 못 봤다.
       *
       * **높이로 세지 않는다.** 처음에 `scrollHeight` 를 줄 높이와 견줬더니
       * 여백 넉넉한 링크가 전부 걸렸다 — "Cart" 한 줄이 36px 상자 안에 있으면
       * 두 줄처럼 보인다. 몇 줄인지는 어림잡을 것 없이 **줄 상자를 세면** 된다.
       *
       * **띄어쓰기 없는 짧은 말은 한 줄이 제자리다.** 그것이 두 줄이 됐다면
       * 상자가 글자보다 좁게 눌린 것이고, 한국어에서는 그 결과가 글자 기둥이다.
       * 긴 문장은 여러 줄이 정상이므로 짧은 것만 본다.
       */
      if (text.length <= 8 && !/\s/.test(text)) {
        const range = document.createRange();
        range.selectNodeContents(el);
        /*
         * **줄 상자의 수가 아니라 줄의 수를 센다.** 한 줄이어도 상자가 여럿
         * 나온다 — 글꼴이 바뀌는 자리에서 쪼개지기 때문이다. "20%" 가 숫자와
         * 기호에서 서로 다른 글꼴을 타 두 조각으로 왔고, 그것을 두 줄로 읽어
         * 홈·카테고리가 통째로 걸렸다. 윗변이 같으면 같은 줄이다.
         */
        const lines = new Set(
          [...range.getClientRects()].map((r) => Math.round(r.top)),
        ).size;
        range.detach();
        if (lines > 1) {
          out.push({
            kind: '글자기둥',
            detail: `<${el.tagName.toLowerCase()}> "${text}" 가 ${lines}줄로 섰다`,
          });
        }
      }

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
