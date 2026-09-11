import type { Page } from '@playwright/test';

/**
 * 화면에 **실제로 칠해진 색**으로 명암비를 잰다.
 *
 * `packages/ui` 의 `tokens.contrast.test.ts` 는 **토큰끼리** 짝지어 잰다 —
 * 설계한 값이 기준을 넘는지 보는 것이다. 그런데 화면에 나오는 색은 토큰만이
 * 아니다. 고정 뉴트럴(`text-n-500` 같은 것)을 그대로 쓴 자리가 있고, 그런
 * 색은 **테마가 바뀌어도 안 바뀐다.** 밝은 화면에서 고른 회색이 어두운
 * 화면에서는 바닥에 가라앉는다.
 *
 * 그래서 여기서는 브라우저가 계산한 `color` 와 뒤에 깔린 배경을 그대로 읽는다.
 * 토큰인지 아닌지는 묻지 않는다 — 읽히는지만 본다.
 */

export interface ContrastProblem {
  readonly ratio: number;
  readonly need: number;
  readonly what: string;
}

/**
 * 이 화면에서 기준에 못 미치는 글자들.
 *
 * **사진 위의 글자는 세지 않는다.** 배경이 색이 아니라 사진이면 뒤에 깔린
 * 값이 픽셀마다 다르고, 그건 이 방법으로 답할 수 있는 문제가 아니다 —
 * 기획전 카드의 흰 제목이 그렇다. 사진과 겹치는 것은 건너뛴다.
 */
export async function contrastProblems(page: Page): Promise<ContrastProblem[]> {
  return page.evaluate(() => {
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    if (!ctx) return [];

    /*
     * **문자열을 파싱하지 않고 칠해 본다.** 이 저장소의 색은 oklch 로
     * 설계돼 있어 `getComputedStyle` 이 `lab(...)` 을 준다. 정규식으로
     * 숫자를 뽑으면 그 값을 RGB 로 착각한다 — 처음에 그렇게 재서 모든
     * 글자가 1.3:1 로 나왔다. 브라우저에게 칠하게 하고 픽셀을 읽는다.
     */
    const px = (color: string): [number, number, number] => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000';
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0];
    };

    const luminance = ([r, g, b]: [number, number, number]): number => {
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };

    const ratio = (a: [number, number, number], b: [number, number, number]): number => {
      const l1 = luminance(a);
      const l2 = luminance(b);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    };

    // 사진이 칠하는 자리들. 겹치면 건너뛴다.
    const painted = [...document.querySelectorAll('*')]
      .filter((e) => e.tagName === 'IMG' || getComputedStyle(e).backgroundImage !== 'none')
      .map((e) => e.getBoundingClientRect());
    const overImage = (r: DOMRect) =>
      painted.some((p) => r.left < p.right - 2 && r.right > p.left + 2 && r.top < p.bottom - 2 && r.bottom > p.top + 2);

    /** 투명한 것을 지나 실제로 칠해진 배경을 찾는다 */
    const backgroundOf = (el: Element): [number, number, number] => {
      let e: Element | null = el;
      while (e) {
        const bg = getComputedStyle(e).backgroundColor;
        if (bg && !bg.includes('rgba(0, 0, 0, 0)')) return px(bg);
        e = e.parentElement;
      }
      return px(getComputedStyle(document.body).backgroundColor);
    };

    const seen = new Set<string>();
    const out: { ratio: number; need: number; what: string }[] = [];

    for (const el of document.querySelectorAll('body *')) {
      if (el.children.length > 0) continue;
      const text = (el.textContent ?? '').trim();
      if (!text) continue;

      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
      // 낭독기 전용은 보이라고 둔 것이 아니다
      if (cs.clipPath !== 'none') continue;

      const rect = el.getBoundingClientRect();
      if (rect.width < 3 || rect.height < 3) continue;
      if (overImage(rect)) continue;

      /*
       * **못 누르는 것은 기준 밖이다.** WCAG 1.4.3 이 비활성 컨트롤을
       * 빼 두었다 — 흐리게 보이는 것이 곧 "지금은 못 누른다" 는 뜻이라
       * 그 흐림을 금지하면 뜻을 전할 방법이 없어진다.
       */
      if (el.closest('[aria-disabled="true"], :disabled') !== null) continue;

      const size = Number.parseFloat(cs.fontSize);
      const bold = Number.parseInt(cs.fontWeight, 10) >= 700;
      /*
       * **낭독기에서 감춘 글자는 대개 장식이다.** 별점의 ★, 빵부스러기의 `/`,
       * 필수 표시의 `*` 은 글자로 그렸을 뿐이고, 읽히는 것은 바로 옆의 글이다.
       * 그런 것에 글자 기준을 들이대면 색이 탁해질 때까지 어둡게 만들어야
       * 하는데, 그건 별점을 못 알아보게 만드는 쪽이다. 세지 않는다.
       *
       * **다만 그 글자가 단추의 전부라면 이야기가 다르다.** 하트 하나로 된
       * 찜 단추는 그 모양이 곧 단추의 얼굴이고, 이름은 낭독기에만 있다.
       * 안 보이면 눌러야 하는 줄도 모른다 — 그림 기준(3:1)으로 잰다.
       */
      const hidden = el.closest('[aria-hidden="true"]') !== null;
      let need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
      if (hidden) {
        const control = el.closest('button, a, [role="button"]');
        const glyphOnly =
          control !== null &&
          ![...control.querySelectorAll('*')].some((other) => {
            if (other === el || other.children.length > 0) return false;
            if (!(other.textContent ?? '').trim()) return false;
            // 낭독기 전용은 눈에 안 보이므로 동무로 치지 않는다
            return getComputedStyle(other).clipPath === 'none';
          });
        if (!glyphOnly) continue;
        need = 3;
      }
      const value = ratio(px(cs.color), backgroundOf(el));
      if (value >= need) continue;

      const what = `<${el.tagName.toLowerCase()}> "${text.slice(0, 18)}" [${(el.className || '').toString().slice(0, 40)}]`;
      if (seen.has(what)) continue;
      seen.add(what);
      out.push({ ratio: Math.round(value * 100) / 100, need, what });
    }
    return out;
  });
}
