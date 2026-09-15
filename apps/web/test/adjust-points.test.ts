import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adjustPointsSchema } from '@shop/contract';
import type { Actor } from '@shop/core';

/**
 * 적립금 수동 지급·차감 — 잔액과 원장을 함께, 차감은 조건부로, 같은 열쇠는 한 번만.
 */

const tx = vi.hoisted(() => ({
  user: {
    update: vi.fn<(...a: any[]) => any>(),
    updateMany: vi.fn<(...a: any[]) => any>(),
    findUniqueOrThrow: vi.fn<(...a: any[]) => any>(),
  },
  pointTransaction: { create: vi.fn<(...a: any[]) => any>() },
}));
const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn<(...a: any[]) => any>() },
  pointTransaction: { findUnique: vi.fn<(...a: any[]) => any>() },
  $transaction: vi.fn<(...a: any[]) => any>(),
}));
vi.mock('@shop/db', () => ({ prisma: db }));
vi.mock('~/lib/merchant/apply', () => ({ activateApprovedMerchant: vi.fn() }));
const getActor = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/auth/session', () => ({ getActor }));
const recordAudit = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/audit', () => ({ recordAudit }));
const enforceRateLimit = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/rate-limit', () => ({ enforceRateLimit }));
const notifyPointsAdjusted = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/account/notify-account', () => ({ notifyPointsAdjusted }));

const { adjustPoints } = await import('~/lib/admin/adjust-points');
const { POST } = await import('~/app/api/admin/users/[id]/points/route');

const admin: Actor = { id: 'u-admin', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-1' };
const NOW = new Date('2026-09-15T00:00:00Z');
const KEY = '3f1c1f7e-6a55-4c1b-9a3e-2d7b0b8f0c11';

const input = (over: Record<string, unknown> = {}) =>
  adjustPointsSchema.parse({ direction: 'GRANT', amount: 3_000, note: '배송 지연 보상', key: KEY, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  db.pointTransaction.findUnique.mockResolvedValue(null);
  db.user.findUnique.mockResolvedValue({ pointBalance: 5_000, deletedAt: null });
  db.$transaction.mockImplementation(async (fn: any) => fn(tx));
  tx.user.updateMany.mockResolvedValue({ count: 1 });
  tx.user.findUniqueOrThrow.mockResolvedValue({ pointBalance: 8_000 });
  getActor.mockResolvedValue(admin);
  enforceRateLimit.mockResolvedValue(null);
});

describe('adjustPoints', () => {
  it('지급은 잔액을 올리고 사유·열쇠·유효기간과 함께 원장에 적는다', async () => {
    const r = await adjustPoints(admin, 'u-1', input(), NOW);
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 'u-1' }, data: { pointBalance: { increment: 3_000 } } });
    const entry = tx.pointTransaction.create.mock.calls[0]?.[0].data;
    expect(entry).toMatchObject({ userId: 'u-1', amount: 3_000, reason: 'ADMIN_ADJUST', note: '배송 지연 보상', adjustKey: KEY });
    expect(entry.expiresAt).toBeInstanceOf(Date);
    expect(r).toEqual({
      userId: 'u-1', direction: 'GRANT', amount: 3_000, note: '배송 지연 보상', balance: 8_000,
      expiresAt: entry.expiresAt, replayed: false,
    });
  });

  it('차감은 지금 잔액이 차감액 이상일 때만 깎고, 원장에 음수·기한 없음으로 적는다', async () => {
    tx.user.findUniqueOrThrow.mockResolvedValue({ pointBalance: 2_000 });
    await adjustPoints(admin, 'u-1', input({ direction: 'DEDUCT' }), NOW);
    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u-1', pointBalance: { gte: 3_000 } },
      data: { pointBalance: { decrement: 3_000 } },
    });
    expect(tx.pointTransaction.create.mock.calls[0]?.[0].data).toMatchObject({ amount: -3_000, expiresAt: null });
  });

  it('잔액보다 많이 차감하려 하면 쓰기 전에 막는다', async () => {
    await expect(adjustPoints(admin, 'u-1', input({ direction: 'DEDUCT', amount: 5_001 }), NOW))
      .rejects.toMatchObject({ code: 'INSUFFICIENT_POINTS', status: 409 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('읽은 뒤 손님이 포인트를 써 잔액이 모자라지면 트랜잭션째 되돌린다 — 원장에 안 들어간다', async () => {
    tx.user.updateMany.mockResolvedValue({ count: 0 });
    await expect(adjustPoints(admin, 'u-1', input({ direction: 'DEDUCT' }), NOW)).rejects.toMatchObject({ code: 'INSUFFICIENT_POINTS' });
    expect(tx.pointTransaction.create).not.toHaveBeenCalled();
  });

  it('탈퇴한 계정·없는 계정은 막는다', async () => {
    db.user.findUnique.mockResolvedValue({ pointBalance: 0, deletedAt: new Date() });
    await expect(adjustPoints(admin, 'u-1', input(), NOW)).rejects.toMatchObject({ code: 'POINTS_USER_CLOSED' });
    db.user.findUnique.mockResolvedValue(null);
    await expect(adjustPoints(admin, 'u-x', input(), NOW)).rejects.toMatchObject({ code: 'USER_NOT_FOUND', status: 404 });
  });

  it('가맹점에게는 권한이 없다', async () => {
    await expect(adjustPoints(merchant, 'u-1', input(), NOW)).rejects.toThrow(/point:adjust/);
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it('같은 열쇠로 이미 들어갔으면 새로 하지 않고 그 결과를 돌려준다', async () => {
    db.pointTransaction.findUnique.mockResolvedValue({ userId: 'u-1', amount: 3_000, note: '배송 지연 보상', user: { pointBalance: 8_000 } });
    const r = await adjustPoints(admin, 'u-1', input(), NOW);
    expect(r).toMatchObject({ replayed: true, balance: 8_000, amount: 3_000, direction: 'GRANT' });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('동시에 두 번 와서 원장 쓰기에서 열쇠가 부딪히면 먼저 들어간 것을 돌려준다', async () => {
    db.pointTransaction.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ userId: 'u-1', amount: 3_000, note: '배송 지연 보상', user: { pointBalance: 8_000 } });
    db.$transaction.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002', meta: { target: ['adjustKey'] } }));
    const r = await adjustPoints(admin, 'u-1', input(), NOW);
    expect(r.replayed).toBe(true);
  });

  it('다른 회원에게 쓴 열쇠면 엉킨 것이라 막는다', async () => {
    db.pointTransaction.findUnique.mockResolvedValue({ userId: 'u-other', amount: 3_000, note: 'x', user: { pointBalance: 1 } });
    await expect(adjustPoints(admin, 'u-1', input(), NOW)).rejects.toMatchObject({ code: 'CHANGED_MEANWHILE' });
  });
});

describe('adjustPointsSchema', () => {
  it('사유 없이, 0 이하·한도 초과·소수는 받지 않는다', () => {
    expect(adjustPointsSchema.safeParse({ direction: 'GRANT', amount: 1, note: '  ', key: KEY }).success).toBe(false);
    expect(adjustPointsSchema.safeParse({ direction: 'GRANT', amount: 0, note: 'a', key: KEY }).success).toBe(false);
    expect(adjustPointsSchema.safeParse({ direction: 'GRANT', amount: 100_001, note: 'a', key: KEY }).success).toBe(false);
    expect(adjustPointsSchema.safeParse({ direction: 'GRANT', amount: 1.5, note: 'a', key: KEY }).success).toBe(false);
    expect(adjustPointsSchema.safeParse({ direction: 'GRANT', amount: 100_000, note: 'a', key: KEY }).success).toBe(true);
  });
});

describe('POST /api/admin/users/[id]/points', () => {
  const call = (body: unknown) =>
    POST(
      new Request('http://localhost/api/admin/users/u-1/points', { method: 'POST', body: JSON.stringify(body) }),
      { params: Promise.resolve({ id: 'u-1' }) },
    );
  const body = { direction: 'GRANT', amount: 3_000, note: '배송 지연 보상', key: KEY };

  it('지급하면 전후 잔액과 사유를 감사 로그에 남긴다', async () => {
    const res = await call(body);
    expect(res.status).toBe(200);
    expect(recordAudit.mock.calls[0]?.[0]).toMatchObject({
      action: 'points.grant', targetType: 'user', targetId: 'u-1',
      before: { balance: 5_000 }, after: { balance: 8_000, amount: 3_000, note: '배송 지연 보상' },
    });
  });

  it('같은 열쇠로 다시 온 요청은 성공으로 답하되 감사 줄도 알림도 더하지 않는다', async () => {
    db.pointTransaction.findUnique.mockResolvedValue({ userId: 'u-1', amount: 3_000, note: '배송 지연 보상', expiresAt: null, user: { pointBalance: 8_000 } });
    const res = await call(body);
    expect(res.status).toBe(200);
    expect(recordAudit).not.toHaveBeenCalled();
    expect(notifyPointsAdjusted, '다시 온 요청에 또 알렸다 — 두 번 받은 줄 안다').not.toHaveBeenCalled();
  });

  it('새로 처리했으면 손님에게 알린다 — 사유·잔액·소멸일과 함께', async () => {
    await call(body);
    expect(notifyPointsAdjusted).toHaveBeenCalledTimes(1);
    expect(notifyPointsAdjusted.mock.calls[0]![0]).toMatchObject({ userId: 'u-1', direction: 'GRANT', amount: 3_000, note: '배송 지연 보상', balance: 8_000 });
    expect(notifyPointsAdjusted.mock.calls[0]![0].expiresAt).toBeInstanceOf(Date);
  });

  it('권한이 없으면 403, 로그인하지 않았으면 401, 입력이 틀리면 400', async () => {
    getActor.mockResolvedValueOnce(merchant);
    expect((await call(body)).status).toBe(403);
    getActor.mockResolvedValueOnce(null);
    expect((await call(body)).status).toBe(401);
    expect((await call({ ...body, note: '' })).status).toBe(400);
  });

  it('잔액이 모자라면 코드와 이유를 돌려준다', async () => {
    const res = await call({ ...body, direction: 'DEDUCT', amount: 9_000 });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'INSUFFICIENT_POINTS' });
    expect(recordAudit).not.toHaveBeenCalled();
  });
});
