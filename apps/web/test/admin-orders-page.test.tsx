// @vitest-environment jsdom
import { render, screen, within } from './render';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';
import { won } from '@shop/core';

const requireAdmin = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/admin/guard', () => ({ requireAdmin }));
const getAdminOrders = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/queries/admin/orders', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/lib/queries/admin/orders')>()),
  getAdminOrders,
}));
vi.mock('@shop/db', () => ({ prisma: {} }));
// 내려받기·일괄 처리는 자기 검사가 있다(order-bulk-actions). 여기서는 목록의 줄만 본다
vi.mock('~/app/admin/orders/order-bulk-actions', () => ({ OrderBulkActions: () => null }));

const Page = (await import('~/app/admin/orders/page')).default;

/**
 * 운영 주문 목록.
 *
 * **출고 직전에 주소가 바뀐 주문을 여기서 알아봐야 한다.** 처리 이력에 줄은 남지만 그것은 주문을 열어야
 * 보이고, 피킹 목록을 이미 뽑았거나 송장을 붙이려던 사람은 열어 볼 이유가 없다 — 옛 주소로 보내고 나서야
 * 안다. 판단은 core 가 하고(showsAddressChanged) 목록은 그 값을 그린다.
 */

const admin: Actor = { id: 'u-admin', role: 'ADMIN', merchantId: null };

const row = (over: Record<string, unknown> = {}) => ({
  orderNo: '20260930-0000001',
  status: 'PREPARING' as const,
  placedAt: new Date('2026-09-30T01:00:00Z'),
  amount: won(100_000),
  buyerName: '장○○',
  itemCount: 1,
  firstItemName: '코튼 케이블 크루넥',
  addressChanged: false,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue(admin);
  getAdminOrders.mockResolvedValue({ rows: [row()], total: 1 });
});

const renderPage = async (params: Record<string, string> = {}) =>
  render(await Page({ searchParams: Promise.resolve(params) }));

describe('주문 목록', () => {
  it('주문 한 줄을 그린다 — 못 그리면 아래가 전부 헛돈다', async () => {
    await renderPage();

    const line = screen.getByRole('row', { name: /20260930-0000001/ });
    expect(within(line).getByRole('link', { name: '20260930-0000001' })).toBeInTheDocument();
    expect(within(line).getByText('코튼 케이블 크루넥')).toBeInTheDocument();
    // 상태 거르기 링크에도 같은 말이 있다 — 줄 안에서 본다
    expect(within(line).getByText('배송준비')).toBeInTheDocument();
  });

  it('배송지가 바뀐 주문을 그 줄에서 알려 준다', async () => {
    getAdminOrders.mockResolvedValue({ rows: [row({ addressChanged: true })], total: 1 });
    await renderPage();

    const line = screen.getByRole('row', { name: /20260930-0000001/ });
    expect(within(line).getByText('배송지 변경')).toBeInTheDocument();
    // 상태는 그대로 보인다 — 새 표시가 원래 있던 것을 덮지 않는다
    expect(within(line).getByText('배송준비')).toBeInTheDocument();
  });

  /** 색으로만 말하면 색을 못 보는 사람에게는 아무 표시가 없는 것과 같다 */
  it('표시는 글자로 한다', async () => {
    getAdminOrders.mockResolvedValue({ rows: [row({ addressChanged: true })], total: 1 });
    await renderPage();

    expect(screen.getByText('배송지 변경').textContent).toBe('배송지 변경');
  });

  it('바뀐 적이 없으면 아무 표시도 없다 — 늘 붙어 있으면 아무도 안 본다', async () => {
    await renderPage();

    expect(screen.queryByText('배송지 변경')).toBeNull();
  });
});

/**
 * **어느 쪽으로 세웠는지 말해 준다.**
 *
 * 아무 말 없이 순서만 바뀌면 사람은 목록이 뒤집힌 줄 모르고 맨 위를 "가장 새 주문" 으로 읽는다 —
 * 그 오해는 오래된 주문을 또 뒤로 민다.
 */
describe('목록을 세운 방향을 말한다', () => {
  it('처리할 일이 남은 탭에서는 그 사실을 적는다', async () => {
    await renderPage({ status: 'PREPARING' });

    expect(screen.getByText(/오래 기다린 주문부터/)).toBeDefined();
  });

  it('보낸 뒤의 탭에서는 적지 않는다 — 거기는 최신순이 맞다', async () => {
    await renderPage({ status: 'DELIVERED' });

    expect(screen.queryByText(/오래 기다린 주문부터/)).toBeNull();
  });

  it('전체 탭에서도 적지 않는다', async () => {
    await renderPage();

    expect(screen.queryByText(/오래 기다린 주문부터/)).toBeNull();
  });
});
