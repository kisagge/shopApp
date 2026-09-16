// @vitest-environment jsdom
import { render, screen, within } from './render';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTranslator } from '@shop/i18n/all';
import type { Actor } from '@shop/core';

const requireAdmin = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/admin/guard', () => ({ requireAdmin }));
const getReturnQueue = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/queries/admin/returns', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/lib/queries/admin/returns')>()),
  getReturnQueue,
}));
vi.mock('@shop/db', () => ({ prisma: {} }));
vi.mock('~/lib/i18n/server', () => ({ getT: () => Promise.resolve(createTranslator('ko')) }));

const Page = (await import('~/app/admin/returns/page')).default;

/** 반품·교환 대기열 화면 — 단계 탭과 수, 내 차례를 글자로, 기다린 날, 주문 상세로 가는 길 */

const admin: Actor = { id: 'u-admin', role: 'ADMIN', merchantId: null };
const counts = { OPEN: 3, REVIEW: 1, AWAIT_ARRIVAL: 1, REFUND: 1, RESHIP: 0, DONE: 7 };
const rows = [
  { id: 'r-1', orderNo: '20260911-0000001', customerName: '김손님', type: 'RETURN', reason: 'DEFECTIVE', stage: 'REFUND', requestedAt: new Date('2026-09-11T00:00:00Z'), resolvedAt: null, waitingDays: 4, productNames: ['울 코트', '니트'], myTurn: true },
  { id: 'r-2', orderNo: '20260914-0000002', customerName: '이손님', type: 'EXCHANGE', reason: 'CHANGED_MIND', stage: 'AWAIT_ARRIVAL', requestedAt: new Date('2026-09-14T00:00:00Z'), resolvedAt: null, waitingDays: 0, productNames: ['셔츠'], myTurn: false },
];

const renderPage = async (params: Record<string, string> = {}) =>
  render(await Page({ searchParams: Promise.resolve(params) }));

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue(admin);
  getReturnQueue.mockResolvedValue({ rows, nextCursor: null, counts });
});

describe('반품·교환 대기열 화면', () => {
  it('반품 처리 권한으로 열고, 모르는 칸·종류는 무시한다', async () => {
    await renderPage({ view: 'NOPE', type: 'X' });
    expect(requireAdmin).toHaveBeenCalledWith('return:resolve');
    expect(getReturnQueue.mock.calls[0]?.[1]).toEqual({ view: 'OPEN', type: undefined, page: 1 });
  });

  it('단계 탭마다 수를 붙이고 지금 칸을 표시한다', async () => {
    await renderPage({ view: 'REFUND', type: 'RETURN' });
    const tabs = screen.getByRole('navigation', { name: '처리 단계' });
    const current = within(tabs).getByRole('link', { current: 'page' });
    expect(current).toHaveTextContent('환불 대기1');
    expect(within(tabs).getByRole('link', { name: /끝남/ })).toHaveAttribute('href', '/admin/returns?view=DONE&type=RETURN');
    expect(getReturnQueue.mock.calls[0]?.[1]).toMatchObject({ view: 'REFUND', type: 'RETURN' });
  });

  it('줄마다 주문 상세로 가는 길, 단계와 내 차례를 글자로, 기다린 날을 적는다', async () => {
    await renderPage();
    const table = screen.getByRole('table');
    const [, first, second] = within(table).getAllByRole('row');
    expect(within(first!).getByRole('link', { name: '20260911-0000001' })).toHaveAttribute('href', '/admin/orders/20260911-0000001');
    expect(first).toHaveTextContent('울 코트 외 1줄');
    expect(first).toHaveTextContent('환불 대기');
    expect(first).toHaveTextContent('내 차례');
    expect(first).toHaveTextContent('4일째');
    expect(second).not.toHaveTextContent('내 차례');
    expect(second).toHaveTextContent('오늘 신청');
    expect(screen.getByText(/이 쪽에서/)).toHaveTextContent('1건이 내 차례입니다');
  });

  it('비었으면 비었다고 말한다', async () => {
    getReturnQueue.mockResolvedValue({ rows: [], nextCursor: null, counts: { ...counts, DONE: 0 } });
    await renderPage({ view: 'DONE' });
    expect(screen.getByText('끝난 신청이 없습니다.')).toBeInTheDocument();
  });
});
