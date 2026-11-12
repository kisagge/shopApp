import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

const db = vi.hoisted(() => ({
  order: { aggregate: vi.fn<(...a: any[]) => any>(), count: vi.fn<(...a: any[]) => any>(), findMany: vi.fn<(...a: any[]) => any>() },
  orderItem: { aggregate: vi.fn<(...a: any[]) => any>(), groupBy: vi.fn<(...a: any[]) => any>() },
  orderRefund: { aggregate: vi.fn<(...a: any[]) => any>() },
  product: { count: vi.fn<(...a: any[]) => any>() },
  payment: { count: vi.fn<(...a: any[]) => any>() },
  // 반품지 없이 파는 곳을 세는 조회
  merchant: { count: vi.fn<(...a: any[]) => any>(), findUnique: vi.fn<(...a: any[]) => any>() },
  returnAddress: { findUnique: vi.fn<(...a: any[]) => any>() },
  eventLog: { groupBy: vi.fn<(...a: any[]) => any>() },
  $queryRaw: vi.fn<(...a: any[]) => any>(),
}));
vi.mock('@shop/db', () => ({ prisma: db, Prisma: { sql: (s: unknown) => s, join: (s: unknown) => s, raw: (s: unknown) => s } }));

const { getDashboard } = await import('~/lib/queries/admin/dashboard');

const admin: Actor = { id: 'u-a', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };

const NOW = new Date('2026-09-09T00:00:00Z');

beforeEach(() => {
  vi.clearAllMocks();
  // 1) 판 것 2) 가맹점 판 것 3) 되돌아간 것(환불 기록) 4) 가맹점 되돌아간 것(줄)
  // 이번 기간 값이 먼저, 그다음 지난 기간(같은 함수로 한 번 더 센다)
  db.order.aggregate
    .mockResolvedValueOnce({ _count: { _all: 40 }, _sum: { payable: 1_000_000 } })
    .mockResolvedValue({ _count: { _all: 20 }, _sum: { payable: 400_000 } });
  db.orderRefund.aggregate.mockResolvedValueOnce({ _sum: { amount: 120_000 } }).mockResolvedValue({ _sum: { amount: 0 } });
  db.orderItem.aggregate
    .mockResolvedValueOnce({ _sum: { subtotal: 500_000 } })
    .mockResolvedValueOnce({ _sum: { subtotal: 40_000 } })
    .mockResolvedValue({ _sum: { subtotal: 0 } });
  db.order.count.mockResolvedValue(0);
  db.product.count.mockResolvedValue(0);
  db.merchant.count.mockResolvedValue(0);
  // 가맹점이 자기 대시보드를 볼 때 "아직 못 하는 일" 을 묻는다 — 기본은 둘 다 등록된 가게다
  db.merchant.findUnique.mockResolvedValue({ settlementAccount: '00100000000001', returnAddress: { id: 'ra-1' } });
  db.returnAddress.findUnique.mockResolvedValue({ id: 'platform' });
  db.payment.count.mockResolvedValue(0);
  db.order.findMany.mockResolvedValue([]);
  db.orderItem.groupBy.mockResolvedValue([]);
  db.eventLog.groupBy.mockResolvedValue([]);
  db.$queryRaw.mockResolvedValue([]);
});

/**
 * 예전에는 `placedAt` 으로 묶고 **지금 상태**로 걸렀다. 그래서 오늘 들어온
 * 반품 접수 하나가 그 주문을 산 날의 매출을 깎았고, 접수를 철회하면 도로
 * 늘었다. 어제 본 숫자와 오늘 본 숫자가 다르면 그 숫자로는 아무 결정도 할 수
 * 없다.
 */
describe('매출은 돈이 오간 시각에 잡는다', () => {
  it('판 금액은 결제 시각으로 센다 — 지금 상태로 거르지 않는다', async () => {
    await getDashboard(admin, '7d', NOW);
    const where = db.order.aggregate.mock.calls[0]?.[0].where;

    expect(where.paidAt, '결제 시각으로 걸러야 한다').toBeDefined();
    expect(
      where.status,
      '상태로 거르면 나중에 상태가 바뀔 때 지나간 날의 숫자가 달라진다',
    ).toBeUndefined();
    expect(where.placedAt, '주문한 시각이 아니라 결제한 시각이다').toBeUndefined();
  });

  it('환불은 환불 기록의 시각에 뺀다 — 판 날로 소급하지 않는다', async () => {
    /*
     * 예전에는 "환불 상태인 주문의 결제액" 이었다. 일부만 취소한 주문은 결제완료인 채로
     * 남아서 **나간 돈이 어디서도 안 빠졌다.** 환불 기록의 합으로 뺀다.
     */
    await getDashboard(admin, '7d', NOW);
    const where = db.orderRefund.aggregate.mock.calls[0]?.[0].where;
    expect(where.createdAt).toEqual({ gte: expect.any(Date), lt: expect.any(Date) });
    // 이번·지난 기간 한 번씩 — 환불을 세려고 주문을 따로 집계하지 않는다
    expect(db.order.aggregate, '주문 상태로 환불을 세면 부분 취소가 빠진다').toHaveBeenCalledTimes(2);
  });

  it('가맹점 환불은 자기 줄의 취소 시각으로, 결제된 주문만 뺀다', async () => {
    await getDashboard(merchant, '7d', NOW);
    const where = db.orderItem.aggregate.mock.calls[1]?.[0].where;
    expect(where.merchantId).toBe('m-a');
    expect(where.canceledAt).toEqual({ gte: expect.any(Date), lt: expect.any(Date) });
    expect(where.order.paidAt, '결제된 적 없는 주문은 되돌릴 돈도 없다').toEqual({ not: null });
  });

  it('반품 접수는 어느 쪽에도 잡히지 않는다 — 돈이 오간 사건이 아니다', async () => {
    await getDashboard(admin, '7d', NOW);
    const shapes = db.order.aggregate.mock.calls.map((c) => JSON.stringify(c[0].where));

    for (const shape of shapes) {
      expect(shape, '반품 접수가 매출 질의에 등장하면 접수만으로 숫자가 흔들린다')
        .not.toContain('RETURN_REQUESTED');
    }
  });

  it('총매출 · 환불 · 순매출을 함께 준다', async () => {
    const d = await getDashboard(admin, '7d', NOW);
    expect(d.period.revenue).toBe(1_000_000);
    expect(d.period.refunded).toBe(120_000);
    expect(d.period.netRevenue).toBe(880_000);
  });

  it('가맹점은 자기 줄만 더하고 뺀다', async () => {
    const d = await getDashboard(merchant, '7d', NOW);
    expect(d.period.revenue).toBe(500_000);
    expect(d.period.refunded).toBe(40_000);
    expect(d.period.netRevenue).toBe(460_000);
  });
});

describe('기간과 지난 기간', () => {
  const kst = (iso: string) => new Date(`${iso}+09:00`);

  it('이번 기간은 끝을 포함하지 않는 창으로, 지난 기간은 같은 함수로 바로 앞 창을 센다', async () => {
    // NOW = KST 2026-09-09 09:00 → 7일: 9/3 00:00 ~ 9/10 00:00, 지난 기간: 8/27 00:00 ~ 9/2 09:00(같은 시각까지)
    await getDashboard(admin, '7d', NOW);
    const [current, previous] = db.order.aggregate.mock.calls.map((c) => c[0].where.paidAt);
    expect(current).toEqual({ gte: kst('2026-09-03T00:00:00'), lt: kst('2026-09-10T00:00:00') });
    expect(previous).toEqual({ gte: kst('2026-08-27T00:00:00'), lt: kst('2026-09-02T09:00:00') });
  });

  it('지난 기간 지표를 함께 준다 — 비교는 화면이 같은 함수(compareValues)로', async () => {
    const d = await getDashboard(admin, '7d', NOW);
    expect(d.previous).toMatchObject({ revenue: 400_000, refunded: 0, netRevenue: 400_000, orderCount: 20, averageOrderValue: 20_000 });
    expect(d.previous.from).toEqual(kst('2026-08-27T00:00:00'));
  });

  it('지난 기간에 조회가 없었으면 전환율은 없다(null) — 0% 로 적으면 "아무도 안 샀다" 로 읽힌다', async () => {
    const d = await getDashboard(admin, '7d', NOW);
    expect(d.previous.conversionRate).toBeNull();
  });

  it('직접 고른 기간을 그대로 쓰고, 탭 값이 없다', async () => {
    const { customPeriod } = await import('@shop/core');
    const r = customPeriod('2026-09-01', '2026-09-05', NOW);
    if (!r.ok) throw new Error(r.message);
    const d = await getDashboard(admin, r.period, NOW);
    expect(d.range).toBeNull();
    expect(d.rangeLabel).toBe('5일');
    expect(db.order.aggregate.mock.calls[0]![0].where.paidAt).toEqual({ gte: kst('2026-09-01T00:00:00'), lt: kst('2026-09-06T00:00:00') });
    // 지난 날로만 된 기간은 온전한 앞 5일과 견준다
    expect(db.order.aggregate.mock.calls[1]![0].where.paidAt).toEqual({ gte: kst('2026-08-27T00:00:00'), lt: kst('2026-09-01T00:00:00') });
  });
});

describe('목록으로 내놓는 것들', () => {
  /*
   * **세는 쪽은 보고 있었는데 내놓는 쪽이 안 돌았다.** 합계·기간은 위에서 다
   * 보지만, 그 아래 네 목록(잘 나간 상품·최근 주문·날짜별 매출·퍼널)은 흉내가
   * 빈 배열을 돌려주어 `map` 안쪽이 한 줄도 안 돌고 있었다. 화면에 **숫자로**
   * 나가는 자리다.
   */
  it('잘 나간 상품은 합계가 없으면 0 으로 적는다 — 빈 칸을 내놓지 않는다', async () => {
    db.orderItem.groupBy.mockResolvedValue([
      { productName: '울 코트', brandName: '무어', _sum: { quantity: 3, subtotal: 180_000 } },
      { productName: '니트', brandName: '무어', _sum: { quantity: null, subtotal: null } },
    ]);

    const { topProducts } = await getDashboard(admin, '7d', NOW);

    expect(topProducts).toEqual([
      { productName: '울 코트', brandName: '무어', quantity: 3, revenue: 180_000 },
      { productName: '니트', brandName: '무어', quantity: 0, revenue: 0 },
    ]);
  });

  it('최근 주문은 산 사람 이름을 가린다', async () => {
    db.order.findMany.mockResolvedValue([
      {
        orderNo: '20260909-0000001', status: 'PAID', placedAt: NOW,
        payable: 128_000, user: { name: '장보영' }, items: false,
      },
    ]);

    const { recentOrders } = await getDashboard(admin, '7d', NOW);

    expect(recentOrders[0]).toMatchObject({ orderNo: '20260909-0000001', amount: 128_000 });
    expect(recentOrders[0]!.buyerName).not.toBe('장보영');
  });

  it('가맹점에게는 자기 줄의 합계만 보여 준다 — 남의 매출을 유추할 수 없게', async () => {
    /*
     * 주문 하나에 여러 가맹점이 섞인다. 주문의 결제 금액을 그대로 보여 주면
     * 자기 몫을 빼서 남의 몫을 알 수 있다.
     */
    db.order.findMany.mockResolvedValue([
      {
        orderNo: '20260909-0000001', status: 'PAID', placedAt: NOW,
        payable: 128_000, user: { name: '장보영' },
        items: [{ subtotal: 30_000 }, { subtotal: 20_000 }],
      },
    ]);

    const { recentOrders } = await getDashboard(merchant, '7d', NOW);

    expect(recentOrders[0]!.amount).toBe(50_000);
  });

  it('날짜별 매출은 DB 가 준 큰 수를 수로 바꿔 준다', async () => {
    /*
     * 합계를 `::bigint` 로 받는다. 그대로 두면 화면에서 더하거나 견줄 수 없고,
     * JSON 으로 내려보낼 때도 터진다.
     */
    db.$queryRaw.mockResolvedValue([
      { date: '2026-09-08', revenue: 1_200_000n },
      { date: '2026-09-09', revenue: -50_000n },
    ]);

    const { dailyRevenue } = await getDashboard(admin, '7d', NOW);

    expect(dailyRevenue).toEqual([
      { date: '2026-09-08', revenue: 1_200_000 },
      { date: '2026-09-09', revenue: -50_000 },
    ]);
    expect(typeof dailyRevenue[0]!.revenue).toBe('number');
  });
});

describe('퍼널', () => {
  /*
   * **주문 조회는 두 자리가 함께 쓴다** — 최근 주문과 가맹점 퍼널. 한 흉내로
   * 덮으면 퍼널 줄이 최근 주문으로 흘러 들어가 `won(undefined)` 로 터진다.
   * 고르는 필드로 가른다.
   */
  const orders = (sessions: { browserSessionId: string | null }[]) => {
    db.order.findMany.mockImplementation(async (args: { select?: Record<string, unknown> }) =>
      args.select?.['browserSessionId'] ? sessions : [],
    );
  };

  it('기간 안에 이벤트가 없으면 네 단계를 0 으로 준다 — 빈 화면이 아니라 0 이다', async () => {
    db.$queryRaw.mockResolvedValue([]);

    const { funnel } = await getDashboard(admin, '7d', NOW);

    expect(funnel, '운영진에게는 퍼널이 있다').not.toBeNull();
    expect(funnel).toHaveLength(4);
    expect(funnel!.every((s) => s.sessions === 0)).toBe(true);
  });

  it('센 수를 그대로 받아 단계로 세운다', async () => {
    /*
     * 세는 것은 DB 가 하고(`count(*) filter`), 비율은 core 가 한다. 이 자리는
     * 그 수를 수로 바꿔 넘기는 일만 한다 — `::bigint` 로 오기 때문이다.
     */
    db.$queryRaw.mockImplementation(async (strings: unknown) => {
      const text = Array.isArray((strings as { strings?: string[] }).strings)
        ? ((strings as { strings: string[] }).strings.join(''))
        : String(strings);
      return text.includes('filter') ? [{ s1: 100n, s2: 40n, s3: 20n, s4: 10n }] : [];
    });

    const { funnel } = await getDashboard(admin, '7d', NOW);

    expect(funnel!.map((s) => s.sessions)).toEqual([100, 40, 20, 10]);
  });

  it('가맹점 퍼널은 세 벌을 세션 id 로 맞댄다 — 주문은 브라우저 세션으로 이어진다', async () => {
    /*
     * 주문에는 가맹점이 하나로 찍히지 않아(한 주문에 여러 가맹점) 이벤트 쪽에서
     * 센다. 주문이 안고 있는 `browserSessionId` 가 조회·담기와 이어지는 자리다.
     */
    db.eventLog.groupBy
      .mockResolvedValueOnce([{ sessionId: 's-1' }, { sessionId: 's-2' }, { sessionId: 's-3' }])
      .mockResolvedValueOnce([{ sessionId: 's-1' }, { sessionId: 's-2' }]);
    orders([{ browserSessionId: 's-1' }]);

    const { funnel } = await getDashboard(merchant, '7d', NOW);

    expect(funnel!.map((s) => s.sessions)).toEqual([3, 2, 1]);
  });

  it('세션을 모르는 줄은 퍼널에서 빠진다 — 결제창에서 돌아오지 못한 주문 등', async () => {
    db.eventLog.groupBy
      .mockResolvedValueOnce([{ sessionId: 's-1' }, { sessionId: null }])
      .mockResolvedValueOnce([{ sessionId: 's-1' }]);
    orders([{ browserSessionId: null }, { browserSessionId: 's-1' }]);

    const { funnel } = await getDashboard(merchant, '7d', NOW);

    expect(funnel!.map((s) => s.sessions)).toEqual([1, 1, 1]);
  });
});
