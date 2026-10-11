// @vitest-environment jsdom
import { render, screen, within } from './render';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { won, LATE_SHIPPING_DAYS, type Actor } from '@shop/core';

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

const dashboard = (
  todo: Record<string, unknown>,
  scope: string | null = null,
) => ({
  scope,
  range: '7d' as const,
  rangeLabel: '최근 7일',
  window: { from: new Date('2026-10-01'), until: new Date('2026-10-08'), days: 7, preset: '7d', fromDay: '2026-10-01', toDay: '2026-10-07' },
  period: kpi,
  previous: { ...kpi, from: new Date('2026-09-24'), until: new Date('2026-10-01'), conversionRate: null },
  todo: {
    preparing: 0, pendingPayment: 0, lateShipping: 0, returnRequested: 0, outOfStock: 0, lowStock: 0,
    lateDeposits: 0, noReturnAddress: 0,
    // 운영진 화면에서는 null — 남의 가게의 빈칸은 가맹점 목록이 보여 준다
    merchantSetup: scope === null ? null : { returnAddress: false, settlementAccount: false },
    ...todo,
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

  /** 남의 가게 수를 가맹점에게 보여 줄 일이 아니다 — 그 사람에게는 자기 가게의 일만 있다 */
  it('가맹점 화면에는 이 줄이 없다', async () => {
    requireAdmin.mockResolvedValue(merchant);
    getDashboard.mockResolvedValue(dashboard({ noReturnAddress: 1 }, 'm-a'));

    await renderPage();

    expect(todoList().queryByRole('link', { name: '반품지 없이 파는 판매처' })).toBeNull();
  });
});

/**
 * **승인받고 들어온 가맹점에게 가장 먼저 할 일.**
 *
 * 반품지가 없으면 상품을 매대에 올릴 수 없고(assertReturnAddress), 정산 계좌가 없으면 지급을 받을 수
 * 없다. 운영진은 가맹점 목록에서 남의 빈칸을 보지만 **정작 그 가맹점 자신에게는 말해 주는 자리가
 * 없었다** — 승인받고 들어와 상품을 올리려다 막히고 나서야 알았다.
 */
describe('가맹점이 아직 못 하는 일', () => {
  const asMerchant = (setup: Record<string, boolean>, todo: Record<string, unknown> = {}) => {
    requireAdmin.mockResolvedValue(merchant);
    getDashboard.mockResolvedValue(
      dashboard({ merchantSetup: { returnAddress: false, settlementAccount: false, ...setup }, ...todo }, 'm-a'),
    );
  };

  /** 새로 승인된 가맹점은 아직 아무것도 안 팔아서 "파는 판매처" 줄에 걸리지 않는다 */
  it('파는 상품이 없어도 반품지 줄을 세운다', async () => {
    asMerchant({ returnAddress: true });

    await renderPage();

    const link = todoList().getByRole('link', { name: /매대에 올릴 수 있습니다/ });
    expect(link.getAttribute('href')).toBe('/admin/merchants/m-a/return-address');
    // "등록했는가" 는 세는 일이 아니다 — 1 을 적으면 한 건 더 올 수 있는 것처럼 읽힌다
    expect(link.textContent).not.toContain('1');
  });

  it('이미 팔고 있으면 급한 일로 말한다 — 그 물건은 지금도 돌아올 곳이 없다', async () => {
    asMerchant({ returnAddress: true }, { noReturnAddress: 1 });

    await renderPage();

    const link = todoList().getByRole('link', { name: /팔고 있는 상품이 있습니다/ });
    expect(within(link).getByText('확인 필요')).toBeDefined();
  });

  it('정산 계좌가 없으면 그 줄도 세우고, 적는 자리로 보낸다', async () => {
    asMerchant({ settlementAccount: true });

    await renderPage();

    const link = todoList().getByRole('link', { name: /정산금을 받을 수 있습니다/ });
    expect(link.getAttribute('href')).toBe('/admin/merchants/m-a/settings');
  });

  it('둘 다 등록돼 있으면 아무 줄도 세우지 않는다', async () => {
    asMerchant({});

    await renderPage();

    expect(todoList().queryByRole('link', { name: /미등록/ })).toBeNull();
  });

  /** 운영진에게는 누구의 일인지 알 수 없는 줄이다 — 남의 가게 빈칸은 가맹점 목록이 보여 준다 */
  it('운영진 화면에는 세우지 않는다', async () => {
    getDashboard.mockResolvedValue(dashboard({}));

    await renderPage();

    expect(todoList().queryByRole('link', { name: /미등록/ })).toBeNull();
  });
});

/**
 * **발송 늦은 주문.**
 *
 * 목록에는 줄마다 "늦음" 이 적히지만 그것은 주문 목록을 열어야 보인다 — 늦은 줄이 몇인지는 아침에
 * 대시보드에서 먼저 알아야 하는 수다. "배송 준비 중" 과 겹치지만 따로 세운다: 스무 건 중 늦은
 * 셋이 어느 것인지는 수가 하나뿐일 때 알 수 없다.
 */
describe('발송 늦은 주문', () => {
  it('있으면 줄을 세우고, 눌러서 그 주문만 볼 수 있다', async () => {
    getDashboard.mockResolvedValue(dashboard({ lateShipping: 3 }));

    await renderPage();

    const link = todoList().getByRole('link', { name: /발송 늦은 주문/ });
    // 눌러서 도착하는 목록이 같은 조건으로 좁혀진다 — 숫자를 찾을 수 있어야 한다
    expect(link.getAttribute('href')).toBe('/admin/orders?late=1');
    expect(within(link).getByText('3')).toBeDefined();
  });

  /** 늘 0 인 줄은 읽히지 않게 된다 — 취소 뒤 입금·반품지와 같은 규칙이다 */
  it('없으면 줄을 세우지 않는다', async () => {
    await renderPage();

    expect(todoList().queryByText(/발송 늦은/)).toBeNull();
  });

  it('급한 일로 표시한다', async () => {
    getDashboard.mockResolvedValue(dashboard({ lateShipping: 1 }));

    await renderPage();

    const link = todoList().getByRole('link', { name: /발송 늦은 주문/ });
    expect(within(link).getByText('확인 필요')).toBeDefined();
  });

  /** 며칠이 늦음인지는 core 가 정한다 — 글자로 박아 두면 기준을 바꿀 때 이 줄만 거짓이 된다 */
  it('기준 날수를 core 에서 가져와 적는다', async () => {
    getDashboard.mockResolvedValue(dashboard({ lateShipping: 1 }));

    await renderPage();

    expect(todoList().getByRole('link', { name: new RegExp(`입금 후 ${LATE_SHIPPING_DAYS}일 넘김`) }))
      .toBeDefined();
  });

  /** 늦은 발송은 가맹점에게도 자기 일이다 — 취소 뒤 입금과 다르다(그건 플랫폼 계좌의 돈이다) */
  it('가맹점 화면에도 이 줄이 있다', async () => {
    requireAdmin.mockResolvedValue(merchant);
    getDashboard.mockResolvedValue(dashboard({ lateShipping: 2 }, 'm-a'));

    await renderPage();

    expect(todoList().getByRole('link', { name: /발송 늦은 주문/ })).toBeDefined();
  });
});
