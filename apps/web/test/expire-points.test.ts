import { describe, it, expect, vi, beforeEach } from 'vitest';

const tx = vi.hoisted(() => ({
  user: { updateMany: vi.fn<(...a: any[]) => any>() },
  pointTransaction: { create: vi.fn<(...a: any[]) => any>() },
}));
const db = vi.hoisted(() => ({
  pointTransaction: { findMany: vi.fn<(...a: any[]) => any>() },
  user: { findUnique: vi.fn<(...a: any[]) => any>() },
  $transaction: vi.fn<(...a: any[]) => any>(),
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const { expirePoints } = await import('~/lib/points/expire');

const NOW = new Date('2026-09-04T00:00:00Z');
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

/** 첫 호출은 대상자 추리기, 두 번째부터는 사람별 원장 */
function ledger(entries: unknown[]) {
  db.pointTransaction.findMany
    .mockResolvedValueOnce([{ userId: 'u-1' }])
    .mockResolvedValueOnce(entries);
}

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx));
  tx.user.updateMany.mockResolvedValue({ count: 1 });
  db.user.findUnique.mockResolvedValue({ name: '홍길동' });
});

describe('대상자 추리기', () => {
  it('기한이 지난 적립이 있는 사람만 본다', async () => {
    // 전체 회원을 훑으면 회원이 늘수록 배치가 그대로 무거워진다
    db.pointTransaction.findMany.mockResolvedValueOnce([]);

    const result = await expirePoints(NOW);

    expect(db.pointTransaction.findMany.mock.calls[0]![0]).toMatchObject({
      where: { amount: { gt: 0 }, expiresAt: { not: null, lte: NOW } },
      distinct: ['userId'],
    });
    expect(result.checked).toBe(0);
  });
});

describe('소멸', () => {
  it('원장에 적고 잔액을 깎는다', async () => {
    /*
     * 잔액만 깎으면 원장 합계와 어긋나고, 그 뒤로 대사 배치가 매번 이
     * 계정을 어긋난 것으로 잡는다.
     */
    ledger([{ amount: 1000, createdAt: day(-400), expiresAt: day(-35) }]);

    const result = await expirePoints(NOW);

    expect(tx.pointTransaction.create.mock.calls[0]![0].data).toMatchObject({
      userId: 'u-1', amount: -1000, reason: 'EXPIRE',
    });
    expect(tx.user.updateMany.mock.calls[0]![0].data).toEqual({
      pointBalance: { decrement: 1000 },
    });
    expect(result.total).toBe(1000);
  });

  it('잔액이 모자라면 건드리지 않는다', async () => {
    /*
     * 배치가 도는 동안 그 사람이 포인트를 썼을 수 있다. 낡은 값으로
     * 덮어쓰면 대사가 오히려 어긋난다 — 다음 실행에서 다시 잡힌다.
     */
    ledger([{ amount: 1000, createdAt: day(-400), expiresAt: day(-35) }]);
    tx.user.updateMany.mockResolvedValue({ count: 0 });

    const result = await expirePoints(NOW);

    expect(tx.pointTransaction.create).not.toHaveBeenCalled();
    expect(result.total).toBe(0);
  });

  it('소멸할 것이 없으면 아무것도 쓰지 않는다', async () => {
    // 기한은 지났지만 이미 다 쓴 경우
    ledger([
      { amount: 1000, createdAt: day(-400), expiresAt: day(-35) },
      { amount: -1000, createdAt: day(-300), expiresAt: null },
    ]);

    const result = await expirePoints(NOW);

    expect(db.$transaction).not.toHaveBeenCalled();
    expect(result.expired).toEqual([]);
  });

  it('두 번 돌려도 같다 — 적어 둔 소멸이 차감으로 들어간다', async () => {
    ledger([
      { amount: 1000, createdAt: day(-400), expiresAt: day(-35) },
      { amount: -1000, createdAt: day(-1), expiresAt: null },
    ]);

    const result = await expirePoints(NOW);

    expect(result.total).toBe(0);
  });

  it('원장 전체를 오래된 순으로 읽는다', async () => {
    // 짝을 지으려면 적립과 사용을 모두 봐야 한다
    ledger([{ amount: 1000, createdAt: day(-400), expiresAt: day(-35) }]);

    await expirePoints(NOW);

    expect(db.pointTransaction.findMany.mock.calls[1]![0]).toMatchObject({
      where: { userId: 'u-1' },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('누가 얼마를 잃었는지 돌려준다', async () => {
    ledger([{ amount: 1500, createdAt: day(-400), expiresAt: day(-35) }]);

    const result = await expirePoints(NOW);

    expect(result.expired).toEqual([{ userId: 'u-1', name: '홍길동', amount: 1500 }]);
  });
});
