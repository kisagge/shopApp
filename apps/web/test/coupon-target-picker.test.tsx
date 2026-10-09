// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from './render';
import type { Actor } from '@shop/core';

/**
 * 쿠폰 대상 고르기 — **고를 수 있는 것과 실제로 붙는 것이 같아야 한다.**
 *
 * 상품은 **말단 분류에만** 붙는다(상품 폼이 말단만 내려 준다). 그런데 쿠폰 대상 고르기는 상위 분류까지
 * 내밀고 있었고, 적용 판정은 상품의 분류와 **정확히 일치**할 때만 맞다고 본다(core couponCoversProduct·
 * 장바구니 범위) — "아우터" 에 쿠폰을 걸면 저장도 발급도 되는데 **어떤 상품에도 붙지 않는다.** 손님은
 * "이 쿠폰은 쓸 수 없습니다" 만 보고, 운영은 까닭을 모른다. 오류도 경고도 없는 고장이다.
 */

const requireAdmin = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/admin/guard', () => ({ requireAdmin }));
const listCoupons = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/admin/manage-coupon', () => ({ listCoupons }));
const db = vi.hoisted(() => ({
  brand: { findMany: vi.fn<(...a: any[]) => any>() },
  category: { findMany: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const Page = (await import('~/app/admin/coupons/page')).default;

const admin: Actor = { id: 'u-admin', role: 'SUPER_ADMIN', merchantId: null };

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue(admin);
  listCoupons.mockResolvedValue([]);
  db.brand.findMany.mockResolvedValue([{ id: 'b-1', name: 'MOOR' }]);
  // 조회가 이미 걸렀다고 보고 말단만 돌려준다 — 거르는 조건 자체는 아래에서 따로 본다
  db.category.findMany.mockResolvedValue([
    { id: 'c-coat', name: '코트' },
    { id: 'c-padding', name: '패딩' },
  ]);
});

describe('고를 수 있는 분류', () => {
  it('말단 분류만 묻는다 — 상품 폼과 같은 조건이다', async () => {
    render(await Page());

    expect(db.category.findMany.mock.calls[0]![0].where).toEqual({ children: { none: {} } });
  });

  it('내려온 분류가 고를 거리로 선다', async () => {
    render(await Page());

    expect(screen.getByRole('checkbox', { name: '코트' })).toBeDefined();
    expect(screen.getByRole('checkbox', { name: '패딩' })).toBeDefined();
  });

  /**
   * 조회가 거르지 못한 날(조건을 지우거나 되돌렸을 때)에도 화면은 그것을 그린다 — 이 검사가 지키는
   * 것은 **조회의 조건**이다. 위 검사가 그 조건을 못 박는다.
   */
  it('상위 분류는 애초에 내려오지 않는다', async () => {
    render(await Page());

    expect(screen.queryByRole('checkbox', { name: '아우터' })).toBeNull();
  });
});
