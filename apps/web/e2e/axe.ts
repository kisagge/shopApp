import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/**
 * 실제 화면을 axe 로 훑는다.
 *
 * 컴포넌트 단위 검사는 이미 있다(packages/ui). 그것이 못 보는 것이 여기
 * 있다 — **조각을 합쳐 놓았을 때 생기는 문제**다. 제목 단계가 건너뛰거나,
 * 같은 이름의 링크가 둘이 되거나, 지역이 겹치거나, 실제로 칠해진 색의
 * 대비가 모자란 것은 조각 하나만 봐서는 알 수 없다.
 *
 * **색 대비는 여기서만 볼 수 있다.** jsdom 에는 레이아웃 엔진이 없어 늘
 * "판단 불가" 로 나오고, 토큰 대비 검사는 토큰 값끼리만 본다 — 사진 위에
 * 얹은 글자처럼 **실제로 칠해진 결과**는 진짜 브라우저라야 잰다.
 */

/** WCAG 2.1 AA 까지. best-practice 는 취향이 섞여 있어 넣지 않는다. */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

export async function expectNoA11yViolations(
  page: Page,
  options: { readonly disable?: readonly string[] } = {},
): Promise<void> {
  let builder = new AxeBuilder({ page }).withTags(TAGS);
  if (options.disable && options.disable.length > 0) {
    builder = builder.disableRules([...options.disable]);
  }

  const { violations } = await builder.analyze();

  const detail = violations
    .map((v) => {
      const nodes = v.nodes.slice(0, 3).map((n) => `      ${n.html.slice(0, 160)}`).join('\n');
      const more = v.nodes.length > 3 ? `\n      … 그 밖에 ${v.nodes.length - 3}곳` : '';
      return `  · [${v.impact}] ${v.id} — ${v.help}\n${nodes}${more}`;
    })
    .join('\n');

  /*
   * 위반 목록을 그대로 견준다. 개수만 견주면 실패했을 때 무엇이 걸렸는지
   * 보이지 않아서, 로그를 뒤지지 않고는 고칠 수가 없다.
   */
  expect(
    violations.map((v) => `[${v.impact}] ${v.id}`),
    `${page.url()}\n${detail}`,
  ).toEqual([]);
}
