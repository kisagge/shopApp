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

  await expectHeadingOrder(page);
}

/**
 * 제목 단계를 건너뛰지 않는다.
 *
 * **axe 에게 맡길 수 없는 자리다.** `heading-order` 는 axe 에서 best-practice 태그라 위의 TAGS 목록에
 * 걸리지 않는다 — 그래서 이 저장소의 훑기는 제목 단계를 **한 번도 본 적이 없었고**, 카테고리·브랜드·검색
 * 세 화면이 h1 다음에 곧바로 상품 카드의 h3 를 놓고 있었다(홈과 기획전은 sr-only h2 를 제대로 두고 있어
 * 더 눈에 안 띄었다).
 *
 * 태그 목록에 best-practice 를 통째로 넣지는 않는다. 취향이 섞인 규칙이 함께 딸려 오는데, 여기서 필요한
 * 것은 이 하나다. 그래서 직접 센다 — axe 를 한 번 더 돌리지 않으니 훑기가 느려지지도 않는다.
 *
 * 숨은 제목은 빼고 sr-only 는 센다. 낭독기에게는 sr-only 가 보이는 제목이다.
 */
async function expectHeadingOrder(page: Page): Promise<void> {
  const skips = await page.evaluate(() => {
    const headings = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')].filter((el) => {
      if (el.closest('[aria-hidden="true"]') !== null) return false;
      const style = getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });

    const found: string[] = [];
    let previous = 0;
    for (const el of headings) {
      const level = Number(el.tagName[1]);
      // 처음 제목은 무엇이든 받는다 — 그 판단은 axe 의 page-has-heading-one 이 한다
      if (previous !== 0 && level > previous + 1) {
        found.push(`h${previous} → h${level} "${el.textContent?.trim().slice(0, 30) ?? ''}"`);
      }
      previous = level;
    }
    return found;
  });

  expect(
    skips,
    `${page.url()}\n  제목 단계를 건너뛴다 — 제목으로 훑어 내려가는 사람에게 소속이 흐려진다:\n` +
      skips.map((s) => `  · ${s}`).join('\n'),
  ).toEqual([]);
}
