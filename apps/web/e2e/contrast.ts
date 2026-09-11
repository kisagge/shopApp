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

/**
 * 이 색이 **테마를 탔는가**.
 *
 * 명암비만 재면 못 보는 결함이 있다. `border-n-300` 은 밝은 화면에서 1.5:1
 * 짜리 **잔잔한 선**인데, 저울의 눈금이라 어두운 화면에서도 같은 값이다 —
 * 그 자리에서는 12:1 짜리 **흰 선**이 된다. 글자가 아니니 명암비 검사에
 * 안 걸리고, 자리도 안 무너진다. 그런데 눈에는 제일 먼저 들어온다.
 *
 * 값을 견주지 않고 **역할**을 견준다. 같은 선이 한쪽에서는 잔잔하고 다른
 * 쪽에서는 또렷하면, 그 색은 테마를 안 탄 것이다. 값으로 견주면 일부러 안
 * 바꾸는 색(브랜드 알약, 사진 위에 뜨는 밝은 알약)까지 전부 걸린다.
 */
export interface ThemeFlipProblem {
  readonly what: string;
  readonly light: number;
  readonly dark: number;
}

/** 한 테마에서 잰 값. 요소 순서로 짝을 맞춘다 — 같은 DOM 이다. */
async function borderProminence(page: Page): Promise<{ what: string; ratio: number }[]> {
  return page.evaluate(() => {
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    if (!ctx) return [];
    const luminance = ([r, g, b]: [number, number, number]) => {
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    /*
     * **반투명한 색은 겹쳐 칠해서 읽는다.**
     *
     * `border-n-900/12` 같은 색은 `getComputedStyle` 이 알파를 그대로 준다.
     * 빈 캔버스에 칠하면 검정 위에 얹혀 거의 검정으로 읽히는데, 화면에서는
     * **밝은 알약 위**에 얹혀 거의 밝게 보인다 — 사진 위에 뜨는 찜 단추가
     * 밝은 화면 1.24:1, 어두운 화면 13.57:1 로 읽혔다. 둘 다 틀린 값이다.
     *
     * 바탕을 먼저 칠하고 그 위에 얹으면 브라우저가 합성해 준다.
     */
    const composite = (layers: string[]): [number, number, number] => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, 1, 1);
      for (const layer of layers) {
        ctx.fillStyle = '#000';
        ctx.fillStyle = layer;
        ctx.fillRect(0, 0, 1, 1);
      }
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0];
    };

    const pageBg = getComputedStyle(document.body).backgroundColor;

    /*
     * **선은 자기가 얹힌 바닥과 견준다.** 화면 바탕과만 견주면, 자기 배경을
     * 들고 있는 것들이 엉뚱하게 걸린다 — 사진 위에 뜨는 흰 알약의 옅은 검정
     * 테두리는 두 테마에서 똑같이 잔잔한데, 화면 바탕과 견주면 "사라졌다" 고
     * 읽힌다.
     */
    const groundLayers = (el: Element): string[] => {
      const layers: string[] = [pageBg];
      const chain: Element[] = [];
      let e: Element | null = el;
      while (e && e !== document.body) {
        chain.push(e);
        e = e.parentElement;
      }
      for (const node of chain.reverse()) {
        const bg = getComputedStyle(node).backgroundColor;
        if (bg && !bg.includes('rgba(0, 0, 0, 0)')) layers.push(bg);
      }
      return layers;
    };

    const out: { what: string; ratio: number }[] = [];
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const width = Math.max(
        Number.parseFloat(cs.borderTopWidth),
        Number.parseFloat(cs.borderBottomWidth),
        Number.parseFloat(cs.borderLeftWidth),
      );
      if (!(width >= 0.5)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) continue;

      const ground = groundLayers(el);
      const groundL = luminance(composite(ground));
      const borderL = luminance(composite([...ground, cs.borderTopColor || cs.borderBottomColor]));
      const ratio = (Math.max(borderL, groundL) + 0.05) / (Math.min(borderL, groundL) + 0.05);
      out.push({
        what: `<${el.tagName.toLowerCase()}> [${(el.className || '').toString().slice(0, 46)}]`,
        ratio: Math.round(ratio * 100) / 100,
      });
    }
    return out;
  });
}

/**
 * 두 테마에서 재서 역할이 뒤바뀐 선을 찾는다.
 *
 * **잔잔함과 또렷함 사이를 건넜을 때만** 센다. 3:1 아래는 나누는 선,
 * 4.5:1 위는 강조하는 선이다. 그 사이는 어느 쪽으로도 읽히므로 묻지 않는다.
 */
export async function themeFlipProblems(page: Page, path: string): Promise<ThemeFlipProblem[]> {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  const light = await borderProminence(page);

  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  const dark = await borderProminence(page);

  const out: ThemeFlipProblem[] = [];
  const seen = new Set<string>();
  for (const [i, l] of light.entries()) {
    const d = dark[i];
    // 두 번 그린 화면이 다르면(광고·시간 표시 등) 짝이 어긋난다 — 그때는 건너뛴다
    if (!d || d.what !== l.what) continue;
    const quiet = 3;
    const loud = 4.5;
    const crossed = (l.ratio < quiet && d.ratio > loud) || (d.ratio < quiet && l.ratio > loud);
    if (!crossed || seen.has(l.what)) continue;
    seen.add(l.what);
    out.push({ what: l.what, light: l.ratio, dark: d.ratio });
  }
  return out;
}
