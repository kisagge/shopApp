// @vitest-environment jsdom
import { render, screen, within } from './render';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WEB_VITAL, type Actor, type VitalRating } from '@shop/core';

const requireAdmin = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/admin/guard', () => ({ requireAdmin }));
const getWebVitals = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
const getTrafficHistory = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/queries/admin/traffic', () => ({ getWebVitals, getTrafficHistory }));
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
