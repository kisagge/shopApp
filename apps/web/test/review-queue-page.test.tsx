// @vitest-environment jsdom
import { render, screen } from './render';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

/**
 * 리뷰 신고 대기줄 — **무엇을 보고 있는지 정확히 말하는가.**
 *
 * 상한(200건)에 걸리면 화면이 그렇게 말한다. 그런데 **그 말이 틀려 있었다**: "우선순위가 높은 200건만
 * 보여 줍니다" 라고 했는데, 점수는 SQL 로 못 매겨서 DB 가 먼저 자른 200건 **안에서만** 세운 순서다.
 * 그 자르는 기준이 곧 무엇이 보이느냐이고, 그 기준은 점수가 아니었다(처음엔 최신순, 지금은 오래된 순).
 *
 * 틀린 안내는 조용하다 — 신고가 몰린 날 운영자는 "급한 건 다 봤다" 고 믿고 창을 닫는다.
 */

const requireAdmin = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/admin/guard', () => ({ requireAdmin }));
const getAdminReviews = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/queries/admin-reviews', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/lib/queries/admin-reviews')>()),
  getAdminReviews,
}));
vi.mock('@shop/db', () => ({ prisma: {} }));

const Page = (await import('~/app/admin/reviews/page')).default;

const admin: Actor = { id: 'u-admin', role: 'SUPER_ADMIN', merchantId: null };

const result = (over: Record<string, unknown> = {}) => ({
  rows: [], total: 0, pending: 0, capped: false, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue(admin);
  getAdminReviews.mockResolvedValue(result());
});

const renderPage = async (params: Record<string, string> = { tab: 'reported' }) =>
  render(await Page({ searchParams: Promise.resolve(params) }));

describe('상한에 걸렸을 때', () => {
  it('무엇을 남겼는지 말한다 — 오래 기다린 쪽이다', async () => {
    getAdminReviews.mockResolvedValue(result({ capped: true }));

    await renderPage();

    const notice = screen.getByRole('status');
    expect(notice.textContent).toContain('오래 기다린 200건');
    // 점수로 고른 200건이 아니다. 점수는 그 안에서의 순서일 뿐이다
    expect(notice.textContent).not.toContain('우선순위가 높은 200건');
  });

  it('상한에 안 걸리면 아무 말도 하지 않는다', async () => {
    await renderPage();

    expect(screen.queryByRole('status')).toBeNull();
  });
});
