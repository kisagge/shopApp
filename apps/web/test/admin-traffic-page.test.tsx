// @vitest-environment jsdom
import { render, screen, within } from './render';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WEB_VITAL, type Actor, type VitalRating } from '@shop/core';

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
  getRouteVitals.mockResolvedValue({ routes: [], since: new Date('2026-08-19T00:00:00Z'), minSamples: 10 });
});

const renderPage = async () => render(await Page());

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
      routes, since: new Date('2026-08-19T00:00:00Z'), minSamples: 10,
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
