import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

/**
 * 운영진이 고른 회원에게 쿠폰을 지급한다.
 *
 * **함수는 있는데 아무 데서도 부르지 않고 있었다.** 권한 검사도 집계도 다
 * 갖춰 놓고 라우트도 화면도 없었다 — 있는 줄 알고 읽는 사람을 속이는 상태였다.
 *
 * 붙이면서 한 사람씩 도는 반복을 걷어냈다. 계약이 허용하는 500명에서 질의가
 * 2천 번이라 서버리스에서 시간 안에 끝나지 않는다.
 */

const recordNotifications = vi.hoisted(() => vi.fn<(...a: any[]) => any>(() => Promise.resolve()));
vi.mock('~/lib/notifications/record', () => ({ recordNotifications }));

const tx = vi.hoisted(() => ({
  userCoupon: {
    findMany: vi.fn<(...a: any[]) => any>(),
    createMany: vi.fn<(...a: any[]) => any>(),
  },
  coupon: { update: vi.fn<(...a: any[]) => any>() },
  $executeRaw: vi.fn<(...a: any[]) => any>(),
}));
const db = vi.hoisted(() => ({
  coupon: { findUnique: vi.fn<(...a: any[]) => any>() },
  $transaction: vi.fn<(...a: any[]) => any>(),
}));
vi.mock('@shop/db', () => ({
  prisma: db,
  Prisma: { PrismaClientKnownRequestError: class extends Error { code = ''; } },
}));

const { issueCouponToUsers, CouponError } = await import('~/lib/admin/manage-coupon');

const admin: Actor = { id: 'u-admin', role: 'ADMIN', merchantId: null };
const customer: Actor = { id: 'u-c', role: 'CUSTOMER', merchantId: null };
const now = new Date('2026-09-15T00:00:00+09:00');

const coupon = (over: Record<string, unknown> = {}) => ({
  id: 'c-1', code: 'WELCOME', name: '가입 축하 쿠폰', isActive: true,
  startsAt: new Date('2026-09-01'), endsAt: new Date('2026-12-31'),
  issueLimit: null, issuedCount: 0,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.coupon.findUnique.mockResolvedValue(coupon());
  db.$transaction.mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx));
  tx.userCoupon.findMany.mockResolvedValue([]);
  tx.$executeRaw.mockResolvedValue(1);
  tx.userCoupon.createMany.mockImplementation(async ({ data }: { data: unknown[] }) => ({
    count: data.length,
  }));
});

const issue = (userIds: string[]) => issueCouponToUsers(admin, 'c-1', userIds, now);

describe('권한', () => {
  it('고객은 지급할 수 없다', async () => {
    await expect(issueCouponToUsers(customer, 'c-1', ['u-1'], now)).rejects.toThrow();
  });
});

describe('한 번에 처리한다', () => {
  /**
   * **사람마다 돌지 않는다.** 계약이 허용하는 500명에서 사람당 질의 네 번이면
   * 2천 번이고, 서버리스에서 시간 안에 끝나지 않는다.
   */
  it('사람 수와 무관하게 넣기는 한 번이다', async () => {
    await issue(['u-1', 'u-2', 'u-3', 'u-4', 'u-5']);

    expect(tx.userCoupon.createMany).toHaveBeenCalledOnce();
    expect(tx.userCoupon.createMany.mock.calls[0]![0].data).toHaveLength(5);
  });

  it('같은 사람을 두 번 골라도 한 번만 센다', async () => {
    const summary = await issue(['u-1', 'u-1', 'u-2']);
    expect(summary.issued).toBe(2);
  });
});

describe('이미 받은 사람', () => {
  it('건너뛰고 나머지에게 준다 — 한 명 때문에 전체를 멈추지 않는다', async () => {
    tx.userCoupon.findMany.mockResolvedValue([{ userId: 'u-2' }]);

    const summary = await issue(['u-1', 'u-2', 'u-3']);

    expect(summary).toEqual({ issued: 2, skipped: 1 });
    expect(tx.userCoupon.createMany.mock.calls[0]![0].data).toHaveLength(2);
  });

  it('전부 이미 받았으면 아무것도 하지 않는다', async () => {
    tx.userCoupon.findMany.mockResolvedValue([{ userId: 'u-1' }, { userId: 'u-2' }]);

    const summary = await issue(['u-1', 'u-2']);

    expect(summary).toEqual({ issued: 0, skipped: 2 });
    expect(tx.userCoupon.createMany).not.toHaveBeenCalled();
    // 한도를 건드리지도 않는다
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
});

describe('수량 한도', () => {
  /**
   * **모자라면 아무에게도 주지 않는다.** 고른 서른 명 중 열 명만 받으면
   * 운영자에게 "누가 받았나" 라는 질문이 남는다.
   */
  it('한 번에 다 들어가지 않으면 아무도 받지 않는다', async () => {
    db.coupon.findUnique.mockResolvedValue(coupon({ issueLimit: 10, issuedCount: 8 }));
    // 조건부 UPDATE 가 0건 — 세 명이 두 자리에 들어가지 않는다
    tx.$executeRaw.mockResolvedValue(0);

    await expect(issue(['u-1', 'u-2', 'u-3'])).rejects.toBeInstanceOf(CouponError);
    expect(tx.userCoupon.createMany).not.toHaveBeenCalled();
  });

  it('남은 장수를 알려 준다 — 다시 고를 수 있어야 한다', async () => {
    db.coupon.findUnique.mockResolvedValue(coupon({ issueLimit: 10, issuedCount: 8 }));
    tx.$executeRaw.mockResolvedValue(0);

    await expect(issue(['u-1', 'u-2', 'u-3'])).rejects.toMatchObject({
      message: expect.stringContaining('2장'),
    });
  });

  /**
   * 우리가 자리를 잡아 둔 사이에 스스로 받아 간 사람이 있을 수 있다.
   * 그만큼 되돌리지 않으면 **남은 장수가 있는데 소진으로 보인다.**
   */
  it('실제로 들어간 수가 적으면 그만큼 되돌린다', async () => {
    tx.userCoupon.createMany.mockResolvedValue({ count: 2 });

    const summary = await issue(['u-1', 'u-2', 'u-3']);

    expect(summary.issued).toBe(2);
    expect(tx.coupon.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { issuedCount: { decrement: 1 } } }),
    );
  });
});

describe('줄 수 없는 쿠폰', () => {
  it('중지된 쿠폰은 아무것도 하기 전에 막는다', async () => {
    db.coupon.findUnique.mockResolvedValue(coupon({ isActive: false }));

    await expect(issue(['u-1'])).rejects.toBeInstanceOf(CouponError);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('없는 쿠폰이면 404 다', async () => {
    db.coupon.findUnique.mockResolvedValue(null);

    await expect(issue(['u-1'])).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });
});

describe('받은 줄 모르면 쿠폰은 없는 것과 같다', () => {
  it('받은 사람에게만 알린다', async () => {
    tx.userCoupon.findMany.mockResolvedValue([{ userId: 'u-2' }]);

    await issue(['u-1', 'u-2', 'u-3']);

    expect(recordNotifications).toHaveBeenCalledOnce();
    const notices = recordNotifications.mock.calls[0]![0] as { userId: string; kind: string }[];
    expect(notices.map((n) => n.userId)).toEqual(['u-1', 'u-3']);
    expect(notices[0]!.kind).toBe('COUPON_ISSUED');
  });

  it('아무도 못 받았으면 알리지 않는다', async () => {
    tx.userCoupon.findMany.mockResolvedValue([{ userId: 'u-1' }]);

    await issue(['u-1']);

    expect(recordNotifications).not.toHaveBeenCalled();
  });
});
