import type { Page, Response } from '@playwright/test';

/**
 * 화면이 받는 정적 자원의 상한 — 여러 프로젝트가 함께 쓴다.
 *
 * 손님 화면은 bundle-budget.spec.ts(guest), 로그인이 필요한 화면은
 * bundle-budget-customer / -admin 이 쓴다. **상한을 한 군데 두는 이유**는
 * 처음에 손님 화면 네 개만 재고 있었기 때문이다 — 결제 화면이 목록에 없어서
 * Zod 398KB 가 되돌아온 것을 아무도 못 봤다.
 */

/**
 * 넉넉히 잡되 384KB 가 되돌아오면 걸리는 자리.
 *
 * 지금은 화면당 558~612KB 다. 여유를 두되, 계약이 다시 딸려 오면
 * 995KB 를 넘겨 걸린다.
 */
export const BUDGET_KB = 800;

/**
 * 스타일 상한.
 *
 * 처음 쟀을 때 화면마다 451KB 였는데 **그중 412KB 가 스타일이 아니라
 * `@font-face` 선언**이었다. 한글 글꼴은 수백 개 조각으로 쪼개져 오고 굵기마다
 * 그 조각 전부에 선언이 하나씩 붙는다 — 쓰지도 않는 굵기 하나가 수십 KB 다.
 * 실제 앱 스타일은 48KB 뿐이었다.
 *
 * **300KB 였다가 150KB 로 조였다.** 본문 한글을 기기 글꼴로 바꾸면서
 * 스타일이 전 화면 229KB → 93KB 가 됐다. 300 을 그대로 두면 본문 웹폰트가
 * 되돌아와도(+141KB → 234KB) 여기서 안 걸린다 — 막으려던 바로 그것을
 * 놓치는 상한이 된다. 93KB 위로 여유는 충분히 남긴다.
 */
export const CSS_BUDGET_KB = 150;

/**
 * 글꼴 상한.
 *
 * **선언만 재고 파일은 안 재고 있었다.** 위 스타일 상한이 @font-face 선언의
 * 무게를 잡아 주는 사이, 정작 내려받는 글꼴 파일은 아무도 안 보고 있었다.
 * 재 보니 매대 한 화면이 208개 1,833KB 를 받았고 그중 실제로 쓰는 것은
 * 35개 334KB 였다 — 미리 받기가 화면에 없는 글자의 조각까지 끌어온 것이다.
 *
 * 본문 한글을 기기 글꼴로 바꾼 뒤로는 세리프(Hahmlet) 조각만 받는다 —
 * 화면마다 19~80KB 다.
 *
 * **600KB 였다가 200KB 로 조였다.** 600 을 두면 본문 웹폰트가 되돌아와
 * 280KB 가 되어도 안 걸린다. 지금 값의 두 배 반이면 미리 받기가 다시
 * 켜지는 것도, 본문 웹폰트가 돌아오는 것도 잡는다.
 */
export const FONT_BUDGET_KB = 200;

/**
 * 하한.
 *
 * **상한 검사는 적게 세면 조용히 통과한다.** 실제로 그랬다 — 아래 `staticKB`
 * 가 원래 쓰던 계산이 글꼴을 **0KB** 로 재고 있었다 — 여덟 번 중 /cart 는
 * 일곱 번, /signup 과 /support 는 다섯 번이 0 이었다. 0 은 600KB 를 넘을 수
 * 없으니 그 검사들은 무엇을 넣어도 통과하는 검사였다. 상한만 있는 검사는
 * 자기가 눈을 감았는지 모른다.
 *
 * **20KB 였다가 5KB 로 내렸다.** 본문 한글을 기기 글꼴로 바꾸면서 글꼴이
 * 통째로 줄었고, 제목이 적은 화면(/cart · /support)은 19KB 가 됐다. 그건
 * 못 센 것이 아니라 진짜 값이다. 이 하한이 잡으려는 것은 **0 에 가까운
 * 값**이지 작은 값이 아니다.
 */
export const FLOOR_KB = 5;

/**
 * 이 화면이 뜨는 데 든 정적 자원의 무게.
 *
 * **시간이 아니라 인과로 자른다.** 원래는 `load` 까지 온 것을 셌다 —
 * 그 뒤로 Next 가 다음 화면의 조각을 미리 받기 때문이다. 그런데 `load` 는
 * 시간 경계지 인과 경계가 아니다. 같은 화면을 열두 번 재 보니 양쪽으로 다 틀렸다.
 *
 * - **많이 세는 쪽**: /signup 스크립트가 601KB 와 993KB 사이를 오갔다.
 *   993KB 는 미리 받기가 `load` 전에 도착한 값이다. 부하가 걸리면 그렇게 된다.
 * - **적게 세는 쪽**: /cart 스크립트가 598KB 대신 369KB, /support 글꼴이
 *   197KB 대신 0KB 로 읽혔다. 이쪽이 더 나쁘다 — 상한 검사가 적게 세면
 *   아무 말 없이 통과한다. 원인은 아래 `pending` 주석에 적었다.
 *
 * 그래서 **서버가 보낸 HTML 이 직접 가리키는 것만** 센다. 그 목록은 화면마다
 * 정해져 있고 시점과 무관하다. 미리 받는 조각은 HTML 에 없으므로 저절로 빠진다.
 * 목록이 다 도착할 때까지 기다리는 것이 networkidle 의 역할이다.
 *
 * 글꼴은 예외다 — HTML 에 한 글자도 안 나온다. 글꼴은 스타일의 `@font-face` 를
 * 보고 브라우저가 **실제로 그리는 글자에 맞춰** 받아 온다. 그러니 이 화면의
 * 스타일이 끌어온 것 전부가 곧 이 화면이 쓴 값이고, 그건 받기를 마쳐야 안다.
 */
export async function staticKB(
  page: Page,
  path: string,
  ext: '.js' | '.css' | '.woff2',
): Promise<number> {
  const bytes = new Map<string, number>();
  /*
   * **몸통이 오기를 기다린다.** 원래는 응답을 듣기만 하고 곧바로 합산했는데,
   * 응답 머리가 왔다는 것과 몸통을 다 받았다는 것은 다르다. 그 사이에 합산하면
   * 아직 안 온 것이 통째로 빠진다 — 옛 방식으로 여덟 번 재 보니 /cart 글꼴이
   * **일곱 번 0KB**, /support 스크립트가 557KB 대신 255·299·328KB 였다.
   * 기다릴 시간을 늘리는 것으로는 못 고친다. 세는 것을 약속으로 모아 둔다.
   */
  const pending: Promise<void>[] = [];
  const onResponse = (response: Response) => {
    // 스크립트와 스타일은 같은 폴더에 있다 — 섞어 세면 어느 쪽이 는지 알 수 없다
    if (!response.url().includes('/_next/static/') || !response.url().endsWith(ext)) return;
    pending.push(
      response
        .body()
        .then((body) => {
          bytes.set(new URL(response.url()).pathname, body.byteLength);
        })
        .catch(() => {
          // 리다이렉트처럼 몸통이 없는 응답은 셀 것이 없다
        }),
    );
  };

  /*
   * **첫 방문의 값을 잰다.** 준비 단계(`before`)가 이미 화면을 한 번 열면
   * 그때 받은 것은 캐시에서 나와 그물에 안 걸린다 — /checkout 의 글꼴이
   * 그래서 0KB 였다. 상한은 처음 오는 사람이 치르는 값이다.
   * 프로젝트가 모두 Chrome 이라 CDP 로 비운다.
   */
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.clearBrowserCache');
  await cdp.detach();

  page.on('response', onResponse);
  const navigation = await page.goto(path, { waitUntil: 'load' });
  if (!navigation) throw new Error(`${path} 로 이동한 응답이 없어 HTML 을 볼 수 없다`);
  const html = await navigation.text();
  await page.waitForLoadState('networkidle');
  page.off('response', onResponse);
  await Promise.all(pending);

  const counted =
    ext === '.woff2' ? [...bytes.keys()] : [...bytes.keys()].filter((url) => html.includes(url));

  return counted.reduce((sum, url) => sum + (bytes.get(url) ?? 0), 0) / 1024;
}

/** 화면 목록 하나로 스크립트·스타일·글꼴 세 검사를 만든다 */
export function budgetTests(
  test: typeof import('@playwright/test').test,
  expect: typeof import('@playwright/test').expect,
  paths: readonly string[],
  before?: (page: Page) => Promise<void>,
): void {
  const cases = [
    { what: '스크립트', particle: '가', ext: '.js', budget: BUDGET_KB },
    { what: '스타일', particle: '이', ext: '.css', budget: CSS_BUDGET_KB },
    { what: '글꼴', particle: '이', ext: '.woff2', budget: FONT_BUDGET_KB },
  ] as const;

  for (const path of paths) {
    for (const { what, particle, ext, budget } of cases) {
      test(`${path} 가 받는 ${what}${particle} 상한 안에 있다`, async ({ page }) => {
        await before?.(page);
        const kb = await staticKB(page, path, ext);
        expect(kb, `${path} 가 ${what} ${Math.round(kb)}KB 를 받는다`).toBeLessThan(budget);
        // 눈을 감고 통과하지 않도록 — FLOOR_KB 주석 참고
        const low = `${path} 의 ${what}을 ${Math.round(kb)}KB 로 쟀다 — 못 세고 있다`;
        expect(kb, low).toBeGreaterThan(FLOOR_KB);
      });
    }
  }
}
