/** oklch → sRGB hex. 디자인 토큰이 CSS에 oklch로 적혀 있어 테스트에서 변환이 필요하다. */
export function oklchToHex(L: number, C: number, H: number): string {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  const gamma = (t: number) => (t > 0.0031308 ? 1.055 * t ** (1 / 2.4) - 0.055 : 12.92 * t);
  const hex = lin
    .map((v) => Math.max(0, Math.min(255, Math.round(gamma(v) * 255))))
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
  return `#${hex.toUpperCase()}`;
}

const channel = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

export function relativeLuminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16) / 255));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** WCAG 2.x 명도 대비. 1(동일) ~ 21(검정/흰색) */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** theme.css에서 `--color-x: oklch(L C H);` 형태를 뽑아 hex 맵으로 만든다 */
export function parseOklchTokens(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /--color-([\w-]+):\s*oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/g;
  for (const m of css.matchAll(re)) {
    out[m[1]!] = oklchToHex(Number(m[2]), Number(m[3]), Number(m[4]));
  }
  return out;
}
