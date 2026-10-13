// @vitest-environment jsdom
import { render, screen, within } from './render';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  WEB_VITAL, VITALS_WINDOW_DAYS, DEFAULT_VITALS_WINDOW, VITALS_MIN_SAMPLES,
  type Actor, type VitalRating,
} from '@shop/core';

const requireAdmin = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/admin/guard', () => ({ requireAdmin }));
const getWebVitals = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
const getTrafficHistory = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
const getRouteVitals = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/queries/admin/traffic', () => ({ getWebVitals, getTrafficHistory, getRouteVitals }));
vi.mock('@shop/db', () => ({ prisma: {} }));

const Page = (await import('~/app/admin/traffic/page')).default;

/**
 * 트래픽 화면의 실사용자 성능 — 앱과 웹을 갈라 놓는 표.
 *
 * **섞여 있으면 앱이 느린지 아닌지를 말할 수 없다.** 앱은 켤 때마다 웹뷰를 차게
 * 띄우는 값이 더 붙는데, 그것이 모바일 웹 숫자에 묻히면 그게 앱 탓인지 화면
 * 탓인지 가릴 수 없다.
 */

const admin: Actor = { id: 'u-admin', role: 'ADMIN', merchantId: null };

const cell = (p75: number | null, rating: VitalRating | null, samples: number) =>
  ({ p75, rating, samples });

const vitalsWith = (byPlatform: {
  web: ReturnType<typeof cell>;
  ios: ReturnType<typeof cell>;
  android: ReturnType<typeof cell>;
}) =>
  WEB_VITAL.map((metric) =>
    metric === 'LCP'
      ? { metric, ...cell(2400, 'needs-improvement' as const, 100), byPlatform }
      : { metric, ...cell(null, null, 0), byPlatform: {
          web: cell(null, null, 0), ios: cell(null, null, 0), android: cell(null, null, 0),
        } },
  );

const EMPTY = WEB_VITAL.map((metric) => ({
  metric,
  ...cell(null, null, 0),
  byPlatform: {
    web: cell(null, null, 0), ios: cell(null, null, 0), android: cell(null, null, 0),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue(admin);
  getTrafficHistory.mockResolvedValue({ months: [], rawSince: '2026-06-18' });
  getWebVitals.mockResolvedValue({ vitals: EMPTY, since: new Date('2026-08-19T00:00:00Z') });
  getRouteVitals.mockResolvedValue({
    routes: [], since: new Date('2026-08-19T00:00:00Z'), minSamples: 10, hidden: 0,
  });
});

/** 구간을 안 적으면 기본(28일)이다 — 주소에 아무것도 없는 평소 상태 */
const renderPage = async (days?: string | string[]) =>
  render(await Page({ searchParams: Promise.resolve(days === undefined ? {} : { days }) }));

describe('플랫폼별 성능 표', () => {
  const withData = () =>
    getWebVitals.mockResolvedValue({
      since: new Date('2026-08-19T00:00:00Z'),
      vitals: vitalsWith({
        web: cell(1900, 'good', 70),
        ios: cell(3100, 'needs-improvement', 25),
        android: cell(4600, 'poor', 30),
      }),
    });

  it('표본이 없으면 표를 그리지 않는다 — 빈 칸만 늘어선 표는 없는 것만 못하다', async () => {
    const { container } = await renderPage();

    expect(container.querySelector('table')).toBeNull();
    expect(screen.getByText(/아직 모인 값이 없습니다/)).toBeInTheDocument();
  });

  it('세 플랫폼이 각자 칸을 가진다', async () => {
    withData();
    await renderPage();

    for (const label of ['웹', 'iOS 앱', '안드로이드 앱']) {
      expect(screen.getByRole('columnheader', { name: label }), label).toBeInTheDocument();
    }
  });

  it('지표는 줄 제목이다 — 표가 두 방향으로 읽힌다', async () => {
    /*
     * td 로 두면 낭독기가 칸 값을 읽을 때 "무엇의 값인지" 를 말해 주지 못한다.
     * 가로 제목이 있어야 "안드로이드 앱, LCP, 4600ms" 로 읽힌다.
     */
    withData();
    await renderPage();

    expect(screen.getByRole('rowheader', { name: 'LCP' })).toBeInTheDocument();
  });

  it('갈라 놓은 값이 실제로 다르게 나온다', async () => {
    withData();
    await renderPage();

    const row = screen.getByRole('row', { name: /LCP/ });
    const cells = within(row).getAllByRole('cell');

    expect(cells[0]!.textContent).toContain('1900');
    expect(cells[1]!.textContent).toContain('3100');
    expect(cells[2]!.textContent).toContain('4600');
  });

  it('좋고 나쁨을 색만으로 말하지 않는다', async () => {
    // 색을 못 보는 사람에게 초록과 빨강은 같은 회색이다
    withData();
    await renderPage();

    const row = screen.getByRole('row', { name: /LCP/ });
    const cells = within(row).getAllByRole('cell');

    expect(cells[0]!.textContent).toContain('좋음');
    expect(cells[1]!.textContent).toContain('개선 필요');
    expect(cells[2]!.textContent).toContain('나쁨');
  });

  it('표본 수를 함께 적는다 — 표본 셋짜리 값으로 판단하면 안 된다', async () => {
    withData();
    await renderPage();

    const row = screen.getByRole('row', { name: /LCP/ });
    expect(within(row).getAllByRole('cell')[2]!.textContent).toContain('30');
  });

  it('표본이 없는 플랫폼은 빈 칸이 아니라 —— 로 말한다', async () => {
    withData();
    await renderPage();

    // INP 는 어느 플랫폼에도 표본이 없다
    const row = screen.getByRole('row', { name: /INP/ });
    for (const c of within(row).getAllByRole('cell')) {
      expect(c.textContent).toBe('—');
    }
  });

  it('표에 무엇을 보는 표인지 적혀 있다', async () => {
    withData();
    const { container } = await renderPage();

    expect(container.querySelector('caption')?.textContent).toMatch(/앱 웹뷰/);
  });
});

/**
 * **"느리다" 까지만 말하면 고치러 갈 데가 없다.**
 *
 * 프로덕션에서 FCP 3.7초를 보고도 어디를 고칠지는 코드를 읽어 짐작해야 했다 — 지표 다섯 칸은
 * 전부 섞은 값이라 어느 화면이 끌어내리는지 말하지 않는다. 그 값은 이미 모으고 있었다.
 */
describe('화면별 성능 표', () => {
  const route = (name: string, lcp: number, rating: VitalRating, samples = 40) => ({
    route: name,
    cells: Object.fromEntries(
      WEB_VITAL.map((metric) => [
        metric,
        metric === 'LCP' ? cell(lcp, rating, samples) : cell(null, null, 0),
      ]),
    ),
  });

  const withRoutes = (...routes: ReturnType<typeof route>[]) =>
    getRouteVitals.mockResolvedValue({
      routes, since: new Date('2026-08-19T00:00:00Z'), minSamples: 10, hidden: 0,
    });

  it('모인 줄이 없으면 표를 그리지 않는다 — 빈 표는 없는 것만 못하다', async () => {
    await renderPage();

    expect(screen.queryByRole('region', { name: '화면별 실사용자 성능' })).toBeNull();
  });

  it('화면과 값을 적는다', async () => {
    withRoutes(route('/product/:id', 4200, 'poor'));

    await renderPage();

    const table = screen.getByRole('region', { name: '화면별 실사용자 성능' });
    expect(within(table).getByText('/product/:id')).toBeDefined();
    expect(within(table).getByText('4200')).toBeDefined();
  });

  /** 색만으로 말하면 색을 못 보는 사람에게는 같은 숫자다 — 위 표와 같은 규칙 */
  it('판정과 표본을 글자로 적는다', async () => {
    withRoutes(route('/product/:id', 4200, 'poor', 37));

    await renderPage();

    const table = screen.getByRole('region', { name: '화면별 실사용자 성능' });
    expect(within(table).getByText(/나쁨 · 표본 37/)).toBeDefined();
  });

  /** 값이 없는 칸에 0 을 적으면 "아주 빠름" 으로 읽힌다 */
  it('안 온 지표는 빈 칸으로 둔다', async () => {
    withRoutes(route('/product/:id', 4200, 'poor'));

    await renderPage();

    const table = screen.getByRole('region', { name: '화면별 실사용자 성능' });
    expect(within(table).getAllByText('—').length).toBeGreaterThan(0);
  });

  /**
   * **그리는 데까지 걸린 시간만 세운다.** INP 는 누른 뒤의 이야기라 "어느 화면이 늦게 뜨나" 와
   * 섞이고, CLS 는 단위가 없어 같은 줄에 두면 밀리초로 읽힌다.
   */
  it('LCP·FCP·TTFB 세 칸만 둔다', async () => {
    withRoutes(route('/', 2000, 'needs-improvement'));

    await renderPage();

    const table = screen.getByRole('region', { name: '화면별 실사용자 성능' });
    const heads = within(table).getAllByRole('columnheader').map((h) => h.textContent);
    expect(heads).toEqual(['화면', 'LCP', 'FCP', 'TTFB']);
  });

  /** 표본이 적은 줄을 세우면 그 줄을 먼저 고치게 된다 — 그 기준을 화면이 말한다 */
  it('표본 기준을 사람에게 말한다', async () => {
    withRoutes(route('/', 2000, 'needs-improvement'));

    await renderPage();

    expect(screen.getByText(/표본이 10개가 안 되는 화면은 세우지 않습니다/)).toBeDefined();
  });

  it('줄이 여럿이면 받은 차례대로 세운다 — 느린 쪽부터는 조회가 정한다', async () => {
    withRoutes(
      route('/product/:id', 4200, 'poor'),
      route('/category/:id', 3100, 'needs-improvement'),
      route('/', 1800, 'good'),
    );

    await renderPage();

    const table = screen.getByRole('region', { name: '화면별 실사용자 성능' });
    const names = within(table).getAllByRole('rowheader').map((h) => h.textContent);
    expect(names).toEqual(['/product/:id', '/category/:id', '/']);
  });
});

/**
 * **구간을 좁혀 볼 수 없으면 배포가 값을 바꿨는지 알 수 없다.**
 *
 * 28일 고정이던 동안, 오늘 내보낸 고침은 지난 27일치 값에 묻혀 거의 움직이지 않았다 —
 * 표본이 서른 몇 개인 화면이라면 더 그렇다. 그사이에 또 손대면 무엇이 무엇을 바꿨는지
 * 영영 가릴 수 없다.
 */
describe('보는 구간 고르개', () => {
  const chooser = () => screen.getByRole('navigation', { name: '보는 구간' });

  it('구간마다 칸이 하나씩 있다', async () => {
    await renderPage();

    const names = within(chooser()).getAllByRole('link').map((a) => a.textContent);
    expect(names).toEqual(VITALS_WINDOW_DAYS.map((d) => `${d}일`));
  });

  /** 주소에 남아야 다시 열어 보고 남에게 보낼 수 있다 — 자바스크립트 없이도 동작한다 */
  it('평범한 링크다 — 구간이 주소에 남는다', async () => {
    await renderPage();

    const hrefs = within(chooser())
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(VITALS_WINDOW_DAYS.map((d) => `/admin/traffic?days=${d}`));
  });

  /** 지금 보고 있는 구간을 색이 아니라 이름으로 알린다 */
  it('지금 구간에 표를 붙인다', async () => {
    await renderPage('7');

    const current = within(chooser())
      .getAllByRole('link')
      .filter((a) => a.getAttribute('aria-current') === 'true')
      .map((a) => a.textContent);
    expect(current).toEqual(['7일']);
  });

  it('아무것도 안 적으면 기본 구간에 표가 붙는다', async () => {
    await renderPage();

    const current = within(chooser())
      .getAllByRole('link')
      .filter((a) => a.getAttribute('aria-current') === 'true')
      .map((a) => a.textContent);
    expect(current).toEqual([`${DEFAULT_VITALS_WINDOW}일`]);
  });

  it.each([1, 7, 28])('고른 구간을 조회에 넘긴다 — %i 일', async (days) => {
    await renderPage(String(days));

    expect(getWebVitals).toHaveBeenCalledWith(admin, days);
    expect(getRouteVitals).toHaveBeenCalledWith(admin, days);
  });

  /*
   * **조회 둘이 저마다 기본값을 들고 있었다.** 화면은 그중 하나가 돌려준 날짜 한 줄만
   * 적는다 — 한쪽 기본값을 고치는 날 화면은 아래 표에 대해 없는 날짜를 말하게 된다.
   */
  it('두 조회가 같은 구간을 본다 — 날짜 한 줄이 둘 다를 가리킨다', async () => {
    await renderPage('1');

    const [, forAll] = getWebVitals.mock.calls[0]!;
    const [, forRoutes] = getRouteVitals.mock.calls[0]!;
    // 둘 다 안 넘기는 것(undefined === undefined)도 "같다" 가 되므로 값까지 못 박는다
    expect(forAll).toBe(1);
    expect(forRoutes).toBe(forAll);
  });

  /*
   * 주소는 누구나 적어 보내고, 이 수는 그대로 질의의 구간이 된다. 거르는 규칙은 core 에
   * 있고(`vitalsWindow`), 화면은 그것을 쓰기만 하는지 본다.
   */
  it.each([
    ['목록 밖의 수', '14'],
    ['표를 통째로 훑게 하는 수', '100000'],
    ['숫자가 아닌 것', 'all'],
    ['두 번 적은 것 중 못 쓰는 쪽이 마지막', ['7', 'all'] as string[]],
  ])('%s 은 기본 구간으로 돌린다', async (_why, raw) => {
    await renderPage(raw);

    expect(getRouteVitals).toHaveBeenCalledWith(admin, DEFAULT_VITALS_WINDOW);
  });

  it('구간을 글로도 적는다 — 어느 때의 값인지 숫자 옆에 있어야 한다', async () => {
    await renderPage('7');

    expect(screen.getByText(/7일간/)).toBeDefined();
  });
});

/**
 * **사라진 표는 고장으로 읽힌다.**
 *
 * 구간을 좁히면 표본도 같이 줄어 화면별 표가 통째로 없어진다. 그때 아무 말이 없으면
 * 읽는 사람은 "하루 치는 아직 없구나" 가 아니라 "표가 깨졌구나" 로 읽고, 구간을 넓혀
 * 볼 생각을 하지 않는다. 방문이 없는 것과 걸러 낸 것은 다른 말이라 다르게 적는다.
 */
describe('세울 줄이 없을 때', () => {
  const withHidden = (hidden: number) =>
    getRouteVitals.mockResolvedValue({
      routes: [], since: new Date('2026-08-19T00:00:00Z'), minSamples: 10, hidden,
    });

  it('걸러 낸 것이 있으면 몇 개인지 말한다', async () => {
    withHidden(5);

    await renderPage('1');

    expect(screen.getByText(/5개 화면이 표본이 모자라 빠졌습니다/)).toBeDefined();
  });

  it('아예 안 쌓인 것은 걸러 낸 것과 다르게 적는다', async () => {
    withHidden(0);

    await renderPage('1');

    expect(screen.getByText(/아직 화면별로 모인 값이 없습니다/)).toBeDefined();
  });

  /** 막다른 말로 끝내지 않는다 — 넓히면 보인다는 것을 같은 자리에서 알린다 */
  it('어떻게 하면 되는지 함께 적는다', async () => {
    withHidden(5);

    await renderPage('1');

    expect(screen.getByText(/구간을 넓혀 보세요/)).toBeDefined();
  });

  it('세울 줄이 있으면 빈 자리 문구를 적지 않는다', async () => {
    getRouteVitals.mockResolvedValue({
      routes: [{
        route: '/',
        cells: Object.fromEntries(
          WEB_VITAL.map((m) => [m, m === 'LCP' ? cell(5407, 'poor', 32) : cell(null, null, 0)]),
        ),
      }],
      since: new Date('2026-08-19T00:00:00Z'),
      minSamples: 10,
      hidden: 3,
    });

    await renderPage();

    expect(screen.queryByText(/구간을 넓혀 보세요/)).toBeNull();
    // 줄은 세우되 몇 개를 걸렀는지는 표 설명에 남는다 — 짧은 표가 "이게 전부" 로 읽힌다
    expect(screen.getByText(/3개 화면이 그렇게 빠졌습니다/)).toBeDefined();
  });
});

/**
 * **여기 없는 화면이 빠른 것은 아니다.**
 *
 * LCP·FCP·TTFB 는 문서를 새로 받을 때 한 번씩 재는 값이고, 이 앱에서 화면 사이를 옮기는
 * 것은 문서를 다시 받지 않는 클라이언트 이동이다(`web-vitals-reporter` 는 적재마다 한 번
 * 건다). 그래서 **처음 들어온 화면만** 쌓이고, 표에는 사실상 홈만 선다.
 *
 * 그 말을 적지 않으면 읽는 사람은 빠진 화면을 "빠른 화면" 으로 읽는다 — 없는 자료에서
 * 결론을 내리게 두는 셈이다.
 */
describe('표가 무엇을 안 담고 있는지', () => {
  it('처음 들어온 화면만 쌓인다는 것을 표가 말한다', async () => {
    getRouteVitals.mockResolvedValue({
      routes: [{
        route: '/',
        cells: Object.fromEntries(
          WEB_VITAL.map((m) => [m, m === 'LCP' ? cell(5407, 'poor', 32) : cell(null, null, 0)]),
        ),
      }],
      since: new Date('2026-08-19T00:00:00Z'),
      minSamples: 10,
      hidden: 0,
    });

    await renderPage();

    expect(screen.getByText(/여기 없는 화면이 빠른 것은 아닙니다/)).toBeDefined();
    expect(screen.getByText(/처음 들어온 화면/)).toBeDefined();
  });
});

/**
 * **표본이 모자란 값에는 판정을 내리지 않는다.**
 *
 * 화면별 표에만 이 규칙이 적혀 있었고 그 표만 지켰다. 그래서 바로 위 플랫폼별 표에서,
 * 안드로이드 한 사람이 한 번 겪은 레이아웃 이동(표본 1)이 **빨간 "나쁨"** 으로 섰다.
 * 읽는 사람은 그 줄을 먼저 고치러 간다 — 그 표가 막겠다고 적어 둔 바로 그 일이다.
 *
 * **값은 지우지 않는다.** 숫자까지 거두면 "안드로이드는 아예 안 쌓인다" 로 읽힌다 —
 * 모자란 것과 없는 것은 다른 말이다.
 */
describe('판정을 내릴 만한 표본', () => {
  const thin = (over: Partial<Record<'web' | 'ios' | 'android', ReturnType<typeof cell>>> = {}) =>
    getWebVitals.mockResolvedValue({
      since: new Date('2026-08-19T00:00:00Z'),
      vitals: vitalsWith({
        web: cell(1900, 'good', 70),
        ios: cell(null, null, 0),
        // 실제로 본 값이다: 안드로이드 CLS 0.283 을 표본 하나로 재고 "나쁨" 이라 적었다
        android: cell(4064, 'poor', 1),
        ...over,
      }),
    });

  const lcpCells = () => within(screen.getByRole('row', { name: /LCP/ })).getAllByRole('cell');

  it('표본이 모자라면 좋고 나쁨을 적지 않는다', async () => {
    thin();

    await renderPage();

    expect(lcpCells()[2]!.textContent).not.toContain('나쁨');
    expect(lcpCells()[2]!.textContent).toContain('판단하기엔 표본이 모자람');
  });

  it('그래도 값과 표본 수는 남긴다 — 모자란 것과 없는 것은 다른 말이다', async () => {
    thin();

    await renderPage();

    expect(lcpCells()[2]!.textContent).toContain('4064');
    expect(lcpCells()[2]!.textContent).toContain('표본 1');
  });

  /** 판정을 못 내리는 칸에 색을 쓰면 색이 곧 판정이 된다 */
  it('판정을 못 내리는 칸은 색도 쓰지 않는다', async () => {
    thin();

    await renderPage();

    expect(lcpCells()[2]!.querySelector('.text-accent')).toBeNull();
    expect(lcpCells()[2]!.querySelector('.text-warning')).toBeNull();
    expect(lcpCells()[2]!.querySelector('.text-success')).toBeNull();
  });

  it('표본이 넉넉한 칸은 그대로 판정한다 — 문턱이 표를 통째로 지우지 않는다', async () => {
    thin();

    await renderPage();

    expect(lcpCells()[0]!.textContent).toContain('좋음');
    expect(lcpCells()[0]!.querySelector('.text-success')).not.toBeNull();
  });

  it('아예 안 온 칸은 여전히 —— 다', async () => {
    thin();

    await renderPage();

    expect(lcpCells()[1]!.textContent).toContain('—');
  });

  /** 경계가 "이상" 인지 "초과" 인지로 한 칸이 갈린다 */
  it.each([
    [VITALS_MIN_SAMPLES - 1, false],
    [VITALS_MIN_SAMPLES, true],
  ])('표본 %i 이면 판정을 내린다: %s', async (samples, judged) => {
    thin({ android: cell(4064, 'poor', samples) });

    await renderPage();

    expect(lcpCells()[2]!.textContent.includes('나쁨')).toBe(judged);
  });

  /** 다섯 타일도 같은 규칙을 쓴다 — 머리에 선 숫자가 가장 많이 읽힌다 */
  it('타일도 표본이 모자라면 판정하지 않는다', async () => {
    getWebVitals.mockResolvedValue({
      since: new Date('2026-08-19T00:00:00Z'),
      vitals: WEB_VITAL.map((metric) => ({
        metric,
        ...cell(4064, 'poor' as const, 2),
        byPlatform: {
          web: cell(null, null, 0), ios: cell(null, null, 0), android: cell(null, null, 0),
        },
      })),
    });

    await renderPage();

    expect(screen.queryAllByText('나쁨')).toEqual([]);
    expect(screen.getAllByText('판단하기엔 표본이 모자람').length).toBe(WEB_VITAL.length);
  });

  /*
   * **줄이 문턱을 넘었다고 칸마다 넘은 것은 아니다.** 화면별 표는 LCP 로 거르므로, LCP 가
   * 서른인 줄에 FCP 가 셋일 수 있다 — 그 칸에 "나쁨" 이 붙으면 줄이 통과했다는 이유로
   * 거짓 판정이 선다.
   */
  it('화면별 표도 칸마다 본다 — 줄이 통과했어도 모자란 칸은 판정하지 않는다', async () => {
    getRouteVitals.mockResolvedValue({
      routes: [{
        route: '/',
        cells: Object.fromEntries(
          WEB_VITAL.map((m) => [
            m,
            m === 'LCP' ? cell(2000, 'good', 30) : cell(4600, 'poor', 3),
          ]),
        ),
      }],
      since: new Date('2026-08-19T00:00:00Z'),
      minSamples: VITALS_MIN_SAMPLES,
      hidden: 0,
    });

    await renderPage();

    const table = screen.getByRole('region', { name: '화면별 실사용자 성능' });
    expect(within(table).getByText(/좋음 · 표본 30/)).toBeDefined();
    expect(within(table).queryByText(/나쁨/)).toBeNull();
    expect(within(table).getAllByText(/판단하기엔 표본이 모자람 · 표본 3/).length).toBe(2);
  });

  /** 규칙을 세 표가 함께 쓰므로, 적는 것도 한 번이면 된다 */
  it('그 규칙을 사람에게 한 번 말한다', async () => {
    thin();

    await renderPage();

    expect(screen.getByText(/표본이 10개가 안 되는 값에는 좋고 나쁨을 적지 않습니다/)).toBeDefined();
  });
});
