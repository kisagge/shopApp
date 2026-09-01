import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

const db = vi.hoisted(() => ({
  user: { findMany: vi.fn<(...a: any[]) => any>(), updateMany: vi.fn<(...a: any[]) => any>() },
  pointTransaction: { groupBy: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const { reconcilePoints } = await import('~/lib/admin/reconcile-points');

const admin: Actor = { id: 'u-a', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };
const customer: Actor = { id: 'u-c', role: 'CUSTOMER', merchantId: null };

const user = (id: string, balance: number) => ({
  id, name: `회원${id}`, email: `${id}@test`, pointBalance: balance,
});
const entry = (userId: string, sum: number, count = 3) => ({
  userId, _sum: { amount: sum }, _count: { _all: count },
});

beforeEach(() => {
  vi.clearAllMocks();
  db.user.updateMany.mockResolvedValue({ count: 1 });
});

describe('권한', () => {
  it('가맹점은 전체 회원 잔액을 볼 수 없다', async () => {
    await expect(reconcilePoints(merchant)).rejects.toThrow();
  });

  it('고객도 볼 수 없다', async () => {
    await expect(reconcilePoints(customer)).rejects.toThrow();
  });

  it('읽기는 user:read, 고치기는 user:write 를 요구한다', async () => {
    db.user.findMany.mockResolvedValue([]);
    db.pointTransaction.groupBy.mockResolvedValue([]);
    await expect(reconcilePoints(admin)).resolves.toBeDefined();
    await expect(reconcilePoints(admin, { fix: true })).resolves.toBeDefined();
  });
});

describe('대사', () => {
  it('일치하는 회원은 목록에 넣지 않는다', async () => {
    db.user.findMany.mockResolvedValue([user('a', 5000)]);
    db.pointTransaction.groupBy.mockResolvedValue([entry('a', 5000)]);
    const r = await reconcilePoints(admin);
    expect(r.mismatches).toHaveLength(0);
    expect(r.checked).toBe(1);
  });

  it('원장보다 많이 들고 있으면 초과 지급으로 잡는다', async () => {
    db.user.findMany.mockResolvedValue([user('a', 7000)]);
    db.pointTransaction.groupBy.mockResolvedValue([entry('a', 5000)]);
    const r = await reconcilePoints(admin);
    expect(r.mismatches[0]).toMatchObject({
      storedBalance: 7000, ledgerBalance: 5000, difference: 2000,
    });
    expect(r.overCredited).toBe(2000);
  });

  it('원장보다 적으면 차이가 음수이고 초과 지급에는 안 들어간다', async () => {
    db.user.findMany.mockResolvedValue([user('a', 1000)]);
    db.pointTransaction.groupBy.mockResolvedValue([entry('a', 5000)]);
    const r = await reconcilePoints(admin);
    expect(r.mismatches[0]?.difference).toBe(-4000);
    expect(r.overCredited).toBe(0);
  });

  it('원장에 줄이 하나도 없는데 잔액이 있으면 불일치다', async () => {
    // 원장 없이 생긴 포인트가 가장 위험하다
    db.user.findMany.mockResolvedValue([user('a', 3000)]);
    db.pointTransaction.groupBy.mockResolvedValue([]);
    const r = await reconcilePoints(admin);
    expect(r.mismatches[0]).toMatchObject({
      storedBalance: 3000, ledgerBalance: 0, difference: 3000, entryCount: 0,
    });
  });

  it('원장도 잔액도 0 이면 불일치가 아니다', async () => {
    db.user.findMany.mockResolvedValue([user('a', 0)]);
    db.pointTransaction.groupBy.mockResolvedValue([]);
    expect((await reconcilePoints(admin)).mismatches).toHaveLength(0);
  });
});

describe('고치기', () => {
  beforeEach(() => {
    db.user.findMany.mockResolvedValue([user('a', 7000), user('b', 100)]);
    db.pointTransaction.groupBy.mockResolvedValue([entry('a', 5000), entry('b', 100)]);
  });

  it('fix 없이는 아무것도 고치지 않는다', async () => {
    const r = await reconcilePoints(admin);
    expect(db.user.updateMany).not.toHaveBeenCalled();
    expect(r.fixed).toBe(0);
  });

  it('원장 합계로 잔액을 덮어쓴다 — 방향은 한쪽뿐이다', async () => {
    const r = await reconcilePoints(admin, { fix: true });
    expect(db.user.updateMany).toHaveBeenCalledTimes(1);
    expect(db.user.updateMany.mock.calls[0]?.[0].data).toEqual({ pointBalance: 5000 });
    expect(r.fixed).toBe(1);
  });

  it('대사 중에 잔액이 바뀐 회원은 건드리지 않는다', async () => {
    // 조건부 UPDATE 라 낡은 값으로 덮어쓰지 않는다
    db.user.updateMany.mockResolvedValue({ count: 0 });
    const r = await reconcilePoints(admin, { fix: true });
    expect(db.user.updateMany.mock.calls[0]?.[0].where.pointBalance).toBe(7000);
    expect(r.fixed).toBe(0);
  });
});

describe('검사 범위', () => {
  it('한 번에 보는 회원 수에 상한이 있다', async () => {
    db.user.findMany.mockResolvedValue([]);
    db.pointTransaction.groupBy.mockResolvedValue([]);
    await reconcilePoints(admin, { limit: 99_999 });
    expect(db.user.findMany.mock.calls[0]?.[0].take).toBe(2000);
  });
});
