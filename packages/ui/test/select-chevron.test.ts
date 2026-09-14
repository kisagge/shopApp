// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parseOklchTokens, contrastRatio } from './color';

/**
 * 드롭다운 화살표는 **우리가 그린 그림**이다.
 *
 * 브라우저 기본 화살표는 안쪽 여백 안에 붙어서, px-2 인 칸에서는 테두리에
 * 붙어 보였다. 그림으로 바꾸면 세 가지가 조용히 깨질 수 있다.
 *
 * - 그림 안의 색은 CSS 변수를 못 읽는다. 토큰을 바꾸면 화살표만 옛 색으로 남는다
 * - 어두운 테마 두 벌 중 한 벌에만 적으면 그쪽에서 밝은 바탕용 화살표가 뜬다
 * - 규칙이 레이어 안에 들어가면 px-2 가 오른쪽 여백을 되돌려 글자가 화살표를 덮는다
 */

const css = readFileSync(resolve(process.cwd(), 'src/styles/theme.css'), 'utf8');
const T = parseOklchTokens(css);
const GRAPHIC = 3.0; // WCAG 1.4.11

function strokes(): string[] {
  return [...css.matchAll(/--select-chevron:[^;]*stroke='%23([0-9a-f]{6})'/gi)].map(([, hex]) => `#${hex!.toUpperCase()}`);
}

describe('드롭다운 화살표', () => {
  it('밝은 테마 한 벌, 어두운 테마 두 벌에 모두 적혀 있다', () => {
    expect(strokes()).toHaveLength(3);
  });

  it('밝은 바탕에서는 n-500 이고 그림으로서 대비를 넘는다', () => {
    const [light] = strokes();
    expect(light, '토큰이 바뀌었는데 화살표 색은 그대로다').toBe(T['n-500']);
    expect(contrastRatio(light!, T['n-0']!)).toBeGreaterThanOrEqual(GRAPHIC);
  });

  it('어두운 바탕에서는 dark-muted 이고 그림으로서 대비를 넘는다', () => {
    const [, device, chosen] = strokes();
    expect(device).toBe(T['dark-muted']);
    expect(chosen).toBe(T['dark-muted']);
    expect(contrastRatio(device!, T['dark-bg']!)).toBeGreaterThanOrEqual(GRAPHIC);
  });

  it('규칙이 레이어 밖에 있어 유틸리티의 여백을 이긴다', () => {
    const at = css.indexOf('select:not([multiple]):not([size]) {');
    expect(at, '드롭다운 규칙이 없다').toBeGreaterThan(-1);

    // 규칙 앞에서 열린 중괄호가 모두 닫혔으면 어떤 @layer 안에도 없다
    const before = css.slice(0, at).replace(/\/\*[\s\S]*?\*\//g, '');
    const depth = [...before].reduce((d, ch) => d + (ch === '{' ? 1 : ch === '}' ? -1 : 0), 0);
    expect(depth, '드롭다운 규칙이 다른 블록 안에 들어갔다').toBe(0);

    const rule = css.slice(at, css.indexOf('}', at));
    expect(rule).toContain('appearance: none');
    expect(rule).toContain('padding-right');
  });
});
