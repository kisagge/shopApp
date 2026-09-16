import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

/**
 * 회원 상세 조회 — 한 사람의 요약. 권한, 없는 회원, 가입 방식, 운영 기록의 대상, 배치 기록의 이름표.
 */

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn<(...a: any[]) => any>(), findMany: vi.fn<(...a: any[]) => any>() },
  inquiry: { count: vi.fn<(...a: any[]) => any>() },
  userCoupon: { count: vi.fn<(...a: any[]) => any>() },
  order: { findMany: vi.fn<(...a: any[]) => any>() },
  adminAuditLog: { findMany: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db }));
const getEffectiveGrade = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/grade/effective', () => ({ getEffectiveGrade }));

const { getAdminUserDetail, USER_DETAIL_RECENT } = await import('~/lib/queries/admin/users');

const admin: Actor = { id: 'u-admin', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-1' };
const NOW = new Date('2026-09-15T00:00:00Z');

const USER = {
  id: 'u-1', name: '김손님', email: 'kim@plain.test', emailVerified: true, phone: '010-1234-5678', role: 'CUSTOMER',
  grade: 'BASIC', createdAt: new Date('2026-01-01'), deletedAt: null, suspendedAt: null, suspendedReason: null,
  pointBalance: 1_200, merchant: null,
  accounts: [{ providerId: 'google' }, { providerId: 'credential' }, { providerId: 'google' }],
  _count: { orders: 12, reviews: 3, wishlist: 5 },
};

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findUnique.mockResolvedValue(USER);
  db.inquiry.count.mockResolvedValueOnce(4).mockResolvedValueOnce(1);
  db.userCoupon.count.mockResolvedValue(2);
  db.order.findMany.mockResolvedValue([
    { orderNo: 'PL-1', status: 'CONFIRMED', payable: 50_000, placedAt: new Date('2026-09-01'), _count: { items: 2 } },
  ]);
  db.adminAuditLog.findMany.mockResolvedValue([
    { id: 'a-1', action: 'points.grant', createdAt: new Date('2026-09-10'), actorLabel: null, actor: { name: '운영자' } },
    { id: 'a-2', action: 'user.suspend', createdAt: new Date('2026-09-09'), actorLabel: '구매확정 배치', actor: null },
    { id: 'a-3', action: 'user.restore', createdAt: new Date('2026-09-08'), actorLabel: null, actor: null },
  ]);
  getEffectiveGrade.mockResolvedValue({ grade: 'SILVER', totalSpent: 320_000, rewardPercent: 2 });
  db.user.findMany.mockResolvedValue([{ id: 'u-park', name: '박운영', role: 'ADMIN', merchantId: null }]);
});

describe('getAdminUserDetail', () => {
  it('가맹점은 회원을 볼 수 없다', async () => {
    await expect(getAdminUserDetail(merchant, 'u-1', NOW)).rejects.toThrow(/user:read/);
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it('없는 회원이면 null', async () => {
    db.user.findUnique.mockResolvedValue(null);
    expect(await getAdminUserDetail(admin, 'u-x', NOW)).toBeNull();
  });

  it('등급과 누적액은 견적이 쓰는 함수에서 낸다 — 저장된 등급이 아니라', async () => {
    const d = (await getAdminUserDetail(admin, 'u-1', NOW))!;
    expect(getEffectiveGrade).toHaveBeenCalledWith('u-1', 'BASIC');
    expect(d).toMatchObject({ grade: 'SILVER', totalSpent: 320_000 });
  });

  it('가입 방식은 겹치지 않게, 늘 같은 순서로', async () => {
    expect((await getAdminUserDetail(admin, 'u-1', NOW))!.signInMethods).toEqual(['credential', 'google']);
  });

  it('활동 수를 모으고, 문의는 지운 것을 빼고 답변 대기를 따로 센다', async () => {
    const d = (await getAdminUserDetail(admin, 'u-1', NOW))!;
    expect(d.counts).toEqual({ orders: 12, reviews: 3, inquiries: 4, inquiriesWaiting: 1, coupons: 2, wishlist: 5 });
    expect(db.inquiry.count.mock.calls[1]?.[0].where).toEqual({ authorId: 'u-1', deletedAt: null, answeredAt: null });
    expect(db.userCoupon.count.mock.calls[0]?.[0].where).toEqual({ userId: 'u-1', usedAt: null, expiresAt: { gt: NOW } });
  });

  it('최근 주문과 운영 기록은 정해진 수만, 최신순으로', async () => {
    const d = (await getAdminUserDetail(admin, 'u-1', NOW))!;
    expect(db.order.findMany.mock.calls[0]?.[0]).toMatchObject({ where: { userId: 'u-1' }, take: USER_DETAIL_RECENT });
    expect(d.recentOrders[0]).toEqual({ orderNo: 'PL-1', status: 'CONFIRMED', payable: 50_000, placedAt: new Date('2026-09-01'), itemCount: 2 });
  });

  it('운영 기록은 이 회원을 대상으로 한 것이고, 사람이 없으면 남긴 이름표·자동 실행으로 적는다', async () => {
    const d = (await getAdminUserDetail(admin, 'u-1', NOW))!;
    expect(db.adminAuditLog.findMany.mock.calls[0]?.[0].where).toEqual({ targetType: 'user', targetId: 'u-1' });
    expect(d.audit.map((a) => a.actorName)).toEqual(['운영자', '구매확정 배치', '자동 실행']);
  });
});

describe('정지를 건 사람', () => {
  /*
   * 적어 두기만 했다. 사유는 화면에 있는데 건 사람은 감사 로그를 뒤져야 나왔다.
   */
  it('정지 중이면 건 사람을 이름과 역할로 준다', async () => {
    db.user.findUnique.mockResolvedValue({
      ...USER, suspendedAt: new Date('2026-09-05'), suspendedReason: '사기 의심', suspendedBy: 'u-park',
    });

    const detail = await getAdminUserDetail(admin, 'u-1', NOW);

    expect(detail?.suspendedBy).toBe('박운영 · 관리자');
    expect(db.user.findMany.mock.calls[0]![0].where).toEqual({ id: { in: ['u-park'] } });
  });

  it('정지 중이 아니면 비우고, 사람을 찾으러 가지도 않는다', async () => {
    const detail = await getAdminUserDetail(admin, 'u-1', NOW);

    expect(detail?.suspendedBy).toBeNull();
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it('건 사람이 적히기 전의 정지면 "기록 없음"', async () => {
    db.user.findUnique.mockResolvedValue({
      ...USER, suspendedAt: new Date('2026-09-05'), suspendedReason: '사기 의심', suspendedBy: null,
    });
    expect((await getAdminUserDetail(admin, 'u-1', NOW))?.suspendedBy).toBe('기록 없음');
  });

  it('건 사람의 계정이 사라졌으면 그렇다고 말한다', async () => {
    db.user.findUnique.mockResolvedValue({
      ...USER, suspendedAt: new Date('2026-09-05'), suspendedReason: '사기 의심', suspendedBy: 'u-gone',
    });
    db.user.findMany.mockResolvedValue([]);
    expect((await getAdminUserDetail(admin, 'u-1', NOW))?.suspendedBy).toBe('탈퇴한 계정');
  });
});
