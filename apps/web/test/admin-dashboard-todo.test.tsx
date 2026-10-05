// @vitest-environment jsdom
import { render, screen, within } from './render';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { won, type Actor } from '@shop/core';

/**
 * 대시보드의 "처리가 필요한 일" — **반품지 없이 팔고 있는 곳.**
 *
 * 이제 반품지가 없으면 매대에 올릴 수 없지만(assertReturnAddress), 그 문이 생기기 전에 올라간 상품은
 * 그대로 서 있다 — 그 가게의 물건은 돌아올 곳이 없다. 가맹점 목록에 "미등록" 뱃지는 붙어 있었어도
 * **지금 파는 곳인지**는 거기서 알 수 없었고, 팔지 않는 가맹점의 미등록은 급한 일이 아니다.
 */

const requireAdmin = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/admin/guard', () => ({ requireAdmin }));
const getDashboard = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/queries/admin/dashboard', () => ({ getDashboard }));
vi.mock('@shop/db', () => ({ prisma: {} }));
// 그림과 기간 고르기는 자기 검사가 있다 — 여기서는 할 일 목록만 본다
vi.mock('~/components/admin/revenue-chart', () => ({ RevenueChart: () => null }));
vi.mock('~/components/admin/range-tabs', () => ({ RangeTabs: () => null }));

const Page = (await import('~/app/admin/page')).default;

const admin: Actor = { id: 'u-admin', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };

const kpi = {
  revenue: won(0), refunded: won(0), netRevenue: won(0), orderCount: 0, averageOrderValue: won(0),
};

const dashboard = (todo: Record<string, number>, scope: string | null = null) => ({
  scope,
  range: '7d' as const,
  rangeLabel: '최근 7일',
  window: { from: new Date('2026-10-01'), until: new Date('2026-10-08'), days: 7, preset: '7d', fromDay: '2026-10-01', toDay: '2026-10-07' },
  period: kpi,
  previous: { ...kpi, from: new Date('2026-09-24'), until: new Date('2026-10-01'), conversionRate: null },
  todo: {
    preparing: 0, pendingPayment: 0, returnRequested: 0, outOfStock: 0, lowStock: 0,
    lateDeposits: 0, noReturnAddress: 0, ...todo,
  },
  topProducts: [], recentOrders: [], dailyRevenue: [], funnel: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue(admin);
  getDashboard.mockResolvedValue(dashboard({}));
});

const renderPage = async () => render(await Page({ searchParams: Promise.resolve({}) }));
const todoList = () => within(screen.getByRole('region', { name: '처리가 필요한 일' }));

describe('반품지 없이 파는 판매처', () => {
  it('있으면 줄을 세우고, 눌러서 등록하러 갈 수 있다', async () => {
    getDashboard.mockResolvedValue(dashboard({ noReturnAddress: 2 }));

    await renderPage();

    const link = todoList().getByRole('link', { name: /반품지 없이 파는 판매처/ });
    expect(link.getAttribute('href')).toBe('/admin/merchants');
    expect(within(link).getByText('2')).toBeDefined();
  });

  /** 늘 0 인 줄은 읽히지 않게 된다 — 취소 뒤 입금과 같은 규칙이다 */
  it('없으면 줄을 세우지 않는다', async () => {
    await renderPage();

    expect(todoList().queryByText(/반품지/)).toBeNull();
  });

  it('급한 일로 표시한다 — 그 가게의 물건은 지금도 돌아올 곳이 없다', async () => {
    getDashboard.mockResolvedValue(dashboard({ noReturnAddress: 1 }));

    await renderPage();

    const link = todoList().getByRole('link', { name: /반품지/ });
    expect(within(link).getByText('확인 필요')).toBeDefined();
  });

  /** 가맹점에게는 남의 가게 수가 아니라 자기 가게의 일이다 */
  it('가맹점에게는 자기 일로 말한다', async () => {
    requireAdmin.mockResolvedValue(merchant);
    getDashboard.mockResolvedValue(dashboard({ noReturnAddress: 1 }, 'm-a'));

    await renderPage();

    expect(todoList().getByRole('link', { name: /팔고 있는 상품이 있습니다/ })).toBeDefined();
  });
});
