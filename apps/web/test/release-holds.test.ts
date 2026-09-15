import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  order: { findMany: vi.fn<(...a: any[]) => any>().mockResolvedValue([]) },
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const cancelOrder = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/orders/cancel-order', () => ({ cancelOrder }));
const notifyAfterSale = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/orders/notify-after-sale', () => ({ notifyAfterSale }));
vi.mock('~/lib/cron', () => ({ CRON_ACTOR: { id: 'system:cron', role: 'SUPER_ADMIN', merchantId: null } }));

const { releaseAbandonedHolds } = await import('~/lib/orders/release-holds');

const NOW = new Date('2026-09-05T12:00:00Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60 * 1000);

const row = (over: Record<string, unknown> = {}) => ({
  orderNo: '20260905-0000001',
  status: 'PENDING',
  placedAt: minutesAgo(60),
  payment: { status: 'READY', pgPaymentKey: null },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.order.findMany.mockResolvedValue([]);
  cancelOrder.mockResolvedValue({ orderNo: 'x', status: 'CANCELLED', refunded: 0 });
});

describe('결제 대기 주문 풀기', () => {
  it('기한이 지난 주문을 취소해 재고를 되돌린다', async () => {
    db.order.findMany.mockResolvedValue([row()]);

    const result = await releaseAbandonedHolds(NOW);

    expect(result.released).toBe(1);
    expect(cancelOrder).toHaveBeenCalledTimes(1);
    // 되돌리는 순서는 cancelOrder 가 안다 — 여기서 다시 쓰지 않는다
    expect(cancelOrder.mock.calls[0]![0]).toBe('20260905-0000001');
  });

  it('시스템이 한 일로 남긴다 — 사람이 취소한 것처럼 보이면 안 된다', async () => {
    db.order.findMany.mockResolvedValue([row()]);
    await releaseAbandonedHolds(NOW);

    const actor = cancelOrder.mock.calls[0]![1];
    expect(actor.id).toBe('system:cron');
  });

  it('가상계좌는 건너뛴다 — 입금까지 며칠이 정상이다', async () => {
    db.order.findMany.mockResolvedValue([
      row({ payment: { status: 'WAITING_FOR_DEPOSIT', pgPaymentKey: null } }),
    ]);

    const result = await releaseAbandonedHolds(NOW);

    expect(result.released).toBe(0);
    expect(result.skipped).toBe(1);
    expect(cancelOrder).not.toHaveBeenCalled();
  });

  it('PG 키를 받은 주문은 건너뛴다 — 돈이 나갔을 수 있다', async () => {
    db.order.findMany.mockResolvedValue([
      row({ payment: { status: 'READY', pgPaymentKey: 'pk_1' } }),
    ]);

    expect((await releaseAbandonedHolds(NOW)).released).toBe(0);
    expect(cancelOrder).not.toHaveBeenCalled();
  });

  it('하나가 실패해도 나머지는 푼다 — 던지면 뒤엣것이 다음 실행까지 묶인다', async () => {
    db.order.findMany.mockResolvedValue([
      row({ orderNo: 'A' }),
      row({ orderNo: 'B' }),
      row({ orderNo: 'C' }),
    ]);
    cancelOrder.mockImplementation(async (orderNo: string) => {
      if (orderNo === 'B') throw new Error('이미 처리된 주문입니다');
      return { orderNo, status: 'CANCELLED', refunded: 0 };
    });

    const result = await releaseAbandonedHolds(NOW);

    expect(result.orderNos).toEqual(['A', 'C']);
    expect(result.skipped).toBe(1);
  });

  it('푼 주문마다 손님에게 알린다 — 배치가 한 일로(사유는 받는 사람의 말로 적는다), 실패한 주문에는 알리지 않는다', async () => {
    db.order.findMany.mockResolvedValue([row({ orderNo: 'A' }), row({ orderNo: 'B' })]);
    cancelOrder.mockImplementation(async (orderNo: string) => {
      if (orderNo === 'B') throw new Error('이미 처리된 주문입니다');
      return { orderNo, status: 'CANCELLED', refunded: 0 };
    });
    await releaseAbandonedHolds(NOW);
    expect(notifyAfterSale).toHaveBeenCalledTimes(1);
    expect(notifyAfterSale).toHaveBeenCalledWith({ kind: 'ORDER_CANCELLED', orderNo: 'A', actorId: 'system:cron' });
  });

  it('조회에서도 기한을 건다 — 전부 읽어 와 거르지 않는다', async () => {
    await releaseAbandonedHolds(NOW);

    const where = db.order.findMany.mock.calls[0]![0].where;
    expect(where.status).toBe('PENDING');
    expect(where.placedAt.lt.getTime()).toBe(NOW.getTime() - 30 * 60 * 1000);
  });

  it('한 번에 처리할 수를 제한한다 — 서버리스는 실행 시간이 유한하다', async () => {
    await releaseAbandonedHolds(NOW);
    expect(db.order.findMany.mock.calls[0]![0].take).toBeGreaterThan(0);
  });

  it('기한을 바꿔 부를 수 있다', async () => {
    await releaseAbandonedHolds(NOW, { minutes: 5 });
    const where = db.order.findMany.mock.calls[0]![0].where;
    expect(where.placedAt.lt.getTime()).toBe(NOW.getTime() - 5 * 60 * 1000);
  });
});
