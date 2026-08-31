import axe from 'axe-core';
import { expect } from 'vitest';

/**
 * axe로 접근성 위반을 검사한다.
 *
 * color-contrast 규칙은 끈다 — jsdom에는 레이아웃 엔진이 없어서 실제로 칠해진
 * 색을 알 수 없고, 항상 "incomplete"로 나온다. 대비는 tokens.contrast.test.ts가
 * 토큰 값에서 직접 계산해 검증한다.
 */
export async function expectNoA11yViolations(container: HTMLElement): Promise<void> {
  const results = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false } },
  });

  if (results.violations.length > 0) {
    const detail = results.violations
      .map((v) => `  · [${v.impact}] ${v.id}: ${v.help}\n    ${v.nodes.map((n) => n.html).join('\n    ')}`)
      .join('\n');
    expect.fail(`접근성 위반 ${results.violations.length}건:\n${detail}`);
  }
}
