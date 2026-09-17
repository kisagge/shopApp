// @vitest-environment jsdom
import { render, screen, within } from './render';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTranslator } from '@shop/i18n/all';
import type { Actor } from '@shop/core';
import type { AdminUserDetail } from '~/lib/queries/admin/users';

const requireAdmin = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/admin/guard', () => ({ requireAdmin }));
const getAdminUserDetail = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/queries/admin/users', () => ({ getAdminUserDetail, USER_DETAIL_RECENT: 10 }));
vi.mock('~/lib/i18n/server', () => ({ getT: () => Promise.resolve(createTranslator('ko')) }));
const notFound = vi.hoisted(() => vi.fn(() => { throw new Error('NEXT_NOT_FOUND'); }));
vi.mock('next/navigation', () => ({ notFound, useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));

const Page = (await import('~/app/admin/users/[id]/page')).default;

/** 회원 상세 화면 — 막힌 상태를 먼저, 요약과 거기로 가는 길, 권한에 따라 폼 */

const admin: Actor = { id: 'u-admin', role: 'ADMIN', merchantId: null };

const detail = (over: Partial<AdminUserDetail> = {}): AdminUserDetail => ({
  id: 'u-1', name: '김손님', email: 'kim@plain.test', emailVerified: false, phone: null, role: 'CUSTOMER',
  merchantName: null, signInMethods: ['credential', 'google'], grade: 'SILVER', totalSpent: 320_000,
  createdAt: new Date('2026-01-01T00:00:00Z'), termsAgreedAt: new Date('2026-01-01T00:05:00Z'), closedAt: null, suspendedAt: null, suspendedReason: null, suspendedBy: null,
  pointBalance: 1_200,
  counts: { orders: 12, reviews: 3, inquiries: 4, inquiriesWaiting: 1, coupons: 2, wishlist: 5 },
  recentOrders: [{ orderNo: 'PL-20260901-0001', status: 'CONFIRMED', payable: 50_000, placedAt: new Date('2026-09-01T00:00:00Z'), itemCount: 2 }],
  audit: [{ id: 'a-1', action: 'points.grant', actorName: '운영자', createdAt: new Date('2026-09-10T00:00:00Z') }],
  ...over,
});

const renderPage = async () => render(await Page({ params: Promise.resolve({ id: 'u-1' }) }));

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue(admin);
  getAdminUserDetail.mockResolvedValue(detail());
});

describe('회원 상세 화면', () => {
  it('회원 조회 권한으로 연다', async () => {
    await renderPage();
    expect(requireAdmin).toHaveBeenCalledWith('user:read');
    expect(screen.getByRole('heading', { level: 1, name: '김손님' })).toBeInTheDocument();
  });

  it('없는 회원이면 404', async () => {
    getAdminUserDetail.mockResolvedValue(null);
    await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('기본 정보에 미인증·로그인 방식을 사람이 읽는 말로 적는다', async () => {
    await renderPage();
    const profile = screen.getByRole('region', { name: '기본 정보' });
    expect(within(profile).getByText('미인증')).toBeInTheDocument();
    expect(within(profile).getByText('이메일·비밀번호, 구글')).toBeInTheDocument();
  });

  it('약관에 동의한 시각을 적는다', async () => {
    await renderPage();
    const profile = screen.getByRole('region', { name: '기본 정보' });
    expect(within(profile).getByText('약관 동의')).toBeInTheDocument();
    expect(within(profile).getByText('약관 동의').nextElementSibling?.querySelector('time')).toHaveAttribute('dateTime', '2026-01-01T00:05:00.000Z');
  });

  it('약관 동의 기록이 없으면 비워 두지 않고 없다고 적는다', async () => {
    getAdminUserDetail.mockResolvedValue(detail({ termsAgreedAt: null }));
    await renderPage();
    expect(within(screen.getByRole('region', { name: '기본 정보' })).getByText('기록 없음')).toBeInTheDocument();
  });

  it('최근 주문은 주문 상세로 가고, 누적액·등급을 함께 말한다', async () => {
    await renderPage();
    const orders = screen.getByRole('region', { name: '최근 주문' });
    expect(within(orders).getByRole('link', { name: 'PL-20260901-0001' })).toHaveAttribute('href', '/admin/orders/PL-20260901-0001');
    expect(orders).toHaveTextContent('구매확정 누적 320,000원');
    expect(orders).toHaveTextContent('등급 실버');
    expect(orders).toHaveTextContent('전체 12건 중 최근 1건입니다.');
  });

  it('포인트 잔액과 조정 화면으로 가는 길 — 권한이 있을 때만 지급·차감이라 적는다', async () => {
    await renderPage();
    const points = screen.getByRole('region', { name: '포인트' });
    expect(points).toHaveTextContent('1,200P');
    expect(within(points).getByRole('link', { name: '포인트 내역 · 지급 · 차감' })).toHaveAttribute('href', '/admin/users/u-1/points');
  });

  it('활동 수와 답변 대기, 운영 기록의 이름표', async () => {
    await renderPage();
    expect(screen.getByRole('region', { name: '활동' })).toHaveTextContent('답변 대기 1');
    expect(screen.getByRole('region', { name: '운영 기록' })).toHaveTextContent('포인트 수동 지급운영자');
  });

  it('정지된 계정이면 맨 위에 사유와 건 사람을 함께 말한다', async () => {
    getAdminUserDetail.mockResolvedValue(detail({
      suspendedAt: new Date('2026-09-05T00:00:00Z'), suspendedReason: '결제 사기 의심', suspendedBy: '박운영 · 관리자',
    }));
    await renderPage();
    expect(screen.getByText(/로그인과 주문이 막혀 있습니다\. 사유: 결제 사기 의심 · 정지한\s+사람: 박운영 · 관리자/)).toBeInTheDocument();
    // 정지 칸에도 건 사람이 있다 — 목록 화면과 같은 폼이다
    expect(screen.getByRole('region', { name: '이용 정지' })).toHaveTextContent('박운영 · 관리자');
    expect(screen.getByRole('button', { name: /정지 해제/ })).toBeInTheDocument();
  });

  it('회원을 고칠 권한이 없으면 정지 폼을, 포인트 권한이 없으면 지급·차감을 내밀지 않는다', async () => {
    requireAdmin.mockResolvedValue({ id: 'u-cs', role: 'MERCHANT', merchantId: 'm-1' } satisfies Actor);
    await renderPage();
    expect(screen.queryByRole('region', { name: '이용 정지' })).toBeNull();
    expect(screen.getByRole('link', { name: '포인트 내역' })).toBeInTheDocument();
  });
});
