import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

/**
 * 포인트 대사.
 *
 * 어긋난 회원을 찾는 것은 SQL 한 문장이라 여기서는 흉내 내지 않는다(진짜 DB 에서는 e2e 가 돈다). 여기서 보는
 * 것은 **읽은 줄을 어떻게 옮기는가**와 **고칠 때 무엇을 믿는가**다 — 고칠 때는 읽어 둔 값이 아니라 잠근 뒤
 * 다시 센 원장을 쓴다.
 */

const tx = vi.hoisted(() => ({
  $queryRaw: vi.fn<(...a: any[]) => any>(),
  pointTransaction: { aggregate: vi.fn<(...a: any[]) => any>() },
  user: { update: vi.fn<(...a: any[]) => any>() },
}));
const db = vi.hoisted(() => ({
  user: { count: vi.fn<(...a: any[]) => any>() },
  $queryRaw: vi.fn<(...a: any[]) => any>(),
  $transaction: vi.fn<(...a: any[]) => any>(),
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const { reconcilePoints, MISMATCH_LIST_MAX } = await import('~/lib/admin/reconcile-points');

const admin: Actor = { id: 'u-a', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };
const customer: Actor = { id: 'u-c', role: 'CUSTOMER', merchantId: null };

/** SQL 이 돌려주는 줄 — 합계·개수는 bigint 로 온다 */
const row = (id: string, stored: number, ledger: number, extra: { total?: number; over?: number; entries?: number } = {}) => ({
  id, name: `회원${id}`, email: `${id}@test`, stored,
  ledger: BigInt(ledger), entries: BigInt(extra.entries ?? 3),
  total: BigInt(extra.total ?? 1), over: BigInt(extra.over ?? Math.max(stored - ledger, 0)),
});

/** 잠근 뒤 본 잔액과 다시 센 원장 */
function lockedAs(balance: number | null, ledger: number) {
  tx.$queryRaw.mockResolvedValue(balance === null ? [] : [{ pointBalance: balance }]);
  tx.pointTransaction.aggregate.mockResolvedValue({ _sum: { amount: ledger } });
}

beforeEach(() => {
  vi.clearAllMocks();
  db.user.count.mockResolvedValue(3);
  db.$queryRaw.mockResolvedValue([]);
  db.$transaction.mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx));
});

describe('권한', () => {
  it('가맹점은 전체 회원 잔액을 볼 수 없다', async () => {
    await expect(reconcilePoints(merchant)).rejects.toThrow();
  });

  it('고객도 볼 수 없다', async () => {
    await expect(reconcilePoints(customer)).rejects.toThrow();
  });

  it('읽기는 user:read, 고치기는 user:write 를 요구한다', async () => {
    await expect(reconcilePoints(admin)).resolves.toBeDefined();
    await expect(reconcilePoints(admin, { fix: true })).resolves.toBeDefined();
  });
});

describe('대사', () => {
  it('검사한 수는 회원 전체다 — 최근 가입자만 세지 않는다', async () => {
    db.user.count.mockResolvedValue(12_345);
    const r = await reconcilePoints(admin);
    expect(r.checked).toBe(12_345);
    expect(db.user.count.mock.calls[0]).toEqual([]);
  });

  it('어긋난 것이 없으면 목록도 합계도 0 이다', async () => {
    const r = await reconcilePoints(admin);
    expect(r).toMatchObject({ mismatches: [], mismatchTotal: 0, overCredited: 0, fixed: 0, fixes: [] });
  });

  it('원장보다 많이 들고 있으면 차이가 양수이고, 초과 지급 합은 SQL 이 센 전체 합이다', async () => {
    db.$queryRaw.mockResolvedValue([row('a', 7000, 5000, { total: 2, over: 2500 }), row('b', 1000, 5000, { total: 2, over: 2500 })]);
    const r = await reconcilePoints(admin);
    expect(r.mismatches[0]).toEqual({
      userId: 'a', name: '회원a', email: 'a@test',
      storedBalance: 7000, ledgerBalance: 5000, difference: 2000, entryCount: 3,
    });
    expect(r.mismatches[1]?.difference).toBe(-4000);
    expect(r.mismatchTotal).toBe(2);
    // 목록에 못 실은 회원 몫까지 — 화면은 전체 위험 금액을 보여야 한다
    expect(r.overCredited).toBe(2500);
  });

  it('목록은 상한까지만 싣고, 어긋난 수는 전체를 센다', async () => {
    db.$queryRaw.mockResolvedValue([row('a', 7000, 5000, { total: 4321 })]);
    const r = await reconcilePoints(admin);
    expect(r.mismatchTotal).toBe(4321);
    expect(r.mismatches).toHaveLength(1);
    // 상한은 SQL 에 실린다
    expect(db.$queryRaw.mock.calls[0]!.slice(1)).toContain(MISMATCH_LIST_MAX);
  });

  it('원장에 줄이 하나도 없는데 잔액이 있으면 그대로 싣는다', async () => {
    db.$queryRaw.mockResolvedValue([row('a', 3000, 0, { entries: 0 })]);
    const r = await reconcilePoints(admin);
    expect(r.mismatches[0]).toMatchObject({ storedBalance: 3000, ledgerBalance: 0, difference: 3000, entryCount: 0 });
  });
});

describe('고치기', () => {
  beforeEach(() => {
    db.$queryRaw.mockResolvedValue([row('a', 7000, 5000)]);
  });

  it('fix 없이는 아무것도 고치지 않는다', async () => {
    const r = await reconcilePoints(admin);
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(r.fixed).toBe(0);
  });

  it('회원을 잠근 뒤 원장을 다시 세어 그 값으로 맞춘다', async () => {
    lockedAs(7000, 5000);
    const r = await reconcilePoints(admin, { fix: true });

    expect(tx.$queryRaw.mock.invocationCallOrder[0]!).toBeLessThan(tx.pointTransaction.aggregate.mock.invocationCallOrder[0]!);
    expect(tx.pointTransaction.aggregate).toHaveBeenCalledWith({ where: { userId: 'a' }, _sum: { amount: true } });
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 'a' }, data: { pointBalance: 5000 } });
    expect(r).toMatchObject({ fixed: 1, fixes: [{ userId: 'a', from: 7000, to: 5000 }] });
  });

  it('읽은 뒤 포인트가 오갔으면 읽어 둔 합계가 아니라 지금 원장으로 맞춘다', async () => {
    // 읽을 때는 7000/5000 이었는데, 그사이 1000P 를 써서 원장 4000·잔액 6000 이 됐다
    lockedAs(6000, 4000);
    const r = await reconcilePoints(admin, { fix: true });
    expect(tx.user.update.mock.calls[0]![0].data).toEqual({ pointBalance: 4000 });
    expect(r.fixes).toEqual([{ userId: 'a', from: 6000, to: 4000 }]);
  });

  it('잠근 뒤 보니 맞으면 쓰지 않고 고친 것으로 세지 않는다', async () => {
    // 옛 방식이라면 "잔액이 그대로" 조건만 보고 옛 합계로 덮었을 경우다
    lockedAs(4000, 4000);
    const r = await reconcilePoints(admin, { fix: true });
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(r).toMatchObject({ fixed: 0, fixes: [] });
  });

  it('그사이 지워진 회원은 건너뛴다', async () => {
    lockedAs(null, 0);
    const r = await reconcilePoints(admin, { fix: true });
    expect(tx.pointTransaction.aggregate).not.toHaveBeenCalled();
    expect(r.fixed).toBe(0);
  });
});
