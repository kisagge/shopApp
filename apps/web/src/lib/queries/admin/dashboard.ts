import 'server-only';
import { prisma, Prisma } from '@shop/db';
import {
  funnelFromCounts, won, FUNNEL_STEP, rangeStart, DASHBOARD_RANGE_LABEL,
  netRevenue, REFUND_STATUS,
  type Actor, type Won, type OrderStatus, type FunnelStepResult, type DashboardRange,
} from '@shop/core';
import { assertAdminQuery, scopeOf, maskName } from './scope';

/**
 * 매출은 **돈이 오간 시각**으로 센다 — 자세한 까닭은 `@shop/core` 의 revenue.ts.
 *
 * 들어온 돈은 결제 시각(`paidAt`), 나간 돈은 환불 시각(`canceledAt`) 에 잡는다.
 * 상태로 거르지 않는다 — 상태는 나중에 바뀌고, 바뀌면 **이미 지나간 날의
 * 숫자가 달라진다.** 실제로 그랬다: 오늘 반품을 접수하면 그 주문을 산 날의
 * 매출이 줄고, 접수를 철회하면 도로 늘었다. 어제 본 차트와 오늘 본 차트가
 * 다르면 그 차트로는 아무것도 정할 수 없다.
 */

/** 결제가 성립한 주문 — 돈이 들어온 시각이 있는 것 */
const paidIn = (from: Date) => ({ paidAt: { gte: from } });

/** 돈이 되돌아간 주문 — 결제된 적 있고, 이 기간에 환불된 것 */
const refundedIn = (from: Date) => ({
  status: { in: [...REFUND_STATUS] },
  paidAt: { not: null },
  canceledAt: { gte: from },
});

export interface DashboardKpi {
  /** 들어온 돈 */
  readonly revenue: Won;
  /** 이 기간에 되돌아간 돈. 지난 기간에 판 것이 지금 환불되면 여기 잡힌다. */
  readonly refunded: Won;
  /** 남은 돈 */
  readonly netRevenue: Won;
  readonly orderCount: number;
  readonly averageOrderValue: Won;
}

export interface DashboardTodo {
  readonly preparing: number;
  readonly pendingPayment: number;
  readonly returnRequested: number;
  readonly lowStock: number;
}

export interface TopProduct {
  readonly productName: string;
  readonly brandName: string;
  readonly quantity: number;
  readonly revenue: Won;
}

export interface RecentOrder {
  readonly orderNo: string;
  readonly status: OrderStatus;
  readonly placedAt: Date;
  readonly amount: Won;
  readonly buyerName: string;
}

export interface DailyRevenue {
  readonly date: string;
  readonly revenue: number;
}

export interface Dashboard {
  readonly scope: string | null;
  readonly range: DashboardRange;
  /** '최근 7일' 처럼 화면에 그대로 쓰는 문구 */
  readonly rangeLabel: string;
  readonly period: DashboardKpi;
  readonly todo: DashboardTodo;
  readonly topProducts: readonly TopProduct[];
  readonly recentOrders: readonly RecentOrder[];
  readonly dailyRevenue: readonly DailyRevenue[];
  /** 전환율 퍼널. 가맹점에게는 주지 않는다 — 전체 트래픽 지표다. */
  readonly funnel: readonly FunnelStepResult[] | null;
}

export async function getDashboard(
  actor: Actor,
  range: DashboardRange = '1d',
  now: Date = new Date(),
): Promise<Dashboard> {
  assertAdminQuery(actor, 'admin:access');
  const scope = scopeOf(actor);

  /**
   * 기간의 시작. 오늘을 포함해서 센다.
   *
   * 90일까지만 고를 수 있다 — 원본 이벤트 보존 기간과 같다. 더 긴 구간을
   * 원본에서 세면 지워진 날이 조용히 0으로 잡혀 트래픽이 줄어든 것처럼 보인다.
   */
  const since = rangeStart(range, now);

  const mine = scope ? { items: { some: { merchantId: scope } } } : {};
  const soldWhere = { ...paidIn(since), ...mine };
  const backWhere = { ...refundedIn(since), ...mine };

  const [soldAgg, soldItems, backAgg, backItems, todo, topRows, recent, daily, funnel] =
    await Promise.all([
      prisma.order.aggregate({
        where: soldWhere,
        _count: { _all: true },
        _sum: { payable: true },
      }),
      // 가맹점 매출은 자기 줄의 합계다 — 다른 가맹점 금액까지 더하면 남의 매출이 샌다
      scope
        ? prisma.orderItem.aggregate({
            where: { merchantId: scope, order: soldWhere },
            _sum: { subtotal: true },
          })
        : Promise.resolve(null),
      prisma.order.aggregate({ where: backWhere, _sum: { payable: true } }),
      scope
        ? prisma.orderItem.aggregate({
            where: { merchantId: scope, order: backWhere },
            _sum: { subtotal: true },
          })
        : Promise.resolve(null),
      loadTodo(scope),
      loadTopProducts(scope, since),
      loadRecentOrders(scope),
      loadDailyRevenue(scope, since),
      scope === null ? loadFunnel(since) : Promise.resolve(null),
    ]);

  const totals = netRevenue(
    scope ? (soldItems?._sum.subtotal ?? 0) : (soldAgg._sum.payable ?? 0),
    scope ? (backItems?._sum.subtotal ?? 0) : (backAgg._sum.payable ?? 0),
  );
  const revenue = totals.gross;
  const orderCount = soldAgg._count._all;

  return {
    scope,
    range,
    rangeLabel:
      range === '1d' ? '오늘' : `최근 ${DASHBOARD_RANGE_LABEL[range]}`,
    period: {
      revenue,
      refunded: totals.refunded,
      netRevenue: totals.net,
      orderCount,
      averageOrderValue: won(orderCount === 0 ? 0 : Math.floor(revenue / orderCount)),
    },
    todo,
    topProducts: topRows,
    recentOrders: recent,
    dailyRevenue: daily,
    funnel,
  };
}

async function loadTodo(scope: string | null): Promise<DashboardTodo> {
  const scoped = scope ? { items: { some: { merchantId: scope } } } : {};
  const [preparing, pendingPayment, returnRequested, lowStock] = await Promise.all([
    prisma.order.count({ where: { status: 'PREPARING', ...scoped } }),
    prisma.order.count({ where: { status: 'PENDING', ...scoped } }),
    prisma.order.count({ where: { status: 'RETURN_REQUESTED', ...scoped } }),
    prisma.productVariant.count({
      where: {
        isActive: true,
        stock: { lte: 5 },
        ...(scope ? { product: { brand: { merchantId: scope } } } : {}),
      },
    }),
  ]);
  return { preparing, pendingPayment, returnRequested, lowStock };
}

async function loadTopProducts(scope: string | null, since: Date): Promise<TopProduct[]> {
  const rows = await prisma.orderItem.groupBy({
    by: ['productName', 'brandName'],
    where: {
      ...(scope ? { merchantId: scope } : {}),
      order: { ...paidIn(since), NOT: { status: { in: [...REFUND_STATUS] } } },
    },
    _sum: { quantity: true, subtotal: true },
    orderBy: { _sum: { subtotal: 'desc' } },
    take: 5,
  });

  return rows.map((r) => ({
    productName: r.productName,
    brandName: r.brandName,
    quantity: r._sum.quantity ?? 0,
    revenue: won(r._sum.subtotal ?? 0),
  }));
}

async function loadRecentOrders(scope: string | null): Promise<RecentOrder[]> {
  const rows = await prisma.order.findMany({
    where: scope ? { items: { some: { merchantId: scope } } } : {},
    orderBy: { placedAt: 'desc' },
    take: 6,
    select: {
      orderNo: true, status: true, placedAt: true, payable: true,
      user: { select: { name: true } },
      items: scope ? { where: { merchantId: scope }, select: { subtotal: true } } : false,
    },
  });

  return rows.map((o) => ({
    orderNo: o.orderNo,
    status: o.status,
    placedAt: o.placedAt,
    // 가맹점에게는 자기 줄의 합계만 보여 준다. 다른 가맹점 상품 금액까지
    // 보여 주면 남의 매출을 유추할 수 있다.
    amount: won(
      scope && Array.isArray(o.items)
        ? o.items.reduce((sum, i) => sum + i.subtotal, 0)
        : o.payable,
    ),
    buyerName: maskName(o.user.name),
  }));
}

async function loadDailyRevenue(scope: string | null, since: Date): Promise<DailyRevenue[]> {
  /*
   * groupBy 로는 날짜 단위 집계가 안 되므로 raw 를 쓴다.
   * KST 로 변환해 자르지 않으면 한국 시간 오전 9시 전 주문이 전날에 붙는다.
   *
   * **결제한 날에 더하고, 환불한 날에 뺀다.** 예전에는 `placedAt` 으로 묶고
   * 지금 상태로 걸러서, 오늘 들어온 반품 접수 하나가 지난주 막대를 깎았다.
   * 두 사건을 한 번의 질의로 합치려고 UNION ALL 로 부호를 뒤집어 더한다.
   */
  const rows = scope
    ? await prisma.$queryRaw<{ date: string; revenue: bigint }[]>`
        select date, sum(amount)::bigint as revenue from (
          select to_char((o."paidAt" + interval '9 hours')::date, 'YYYY-MM-DD') as date,
                 i.subtotal as amount
          from orders o join order_items i on i."orderId" = o.id
          where i."merchantId" = ${scope} and o."paidAt" >= ${since}
          union all
          select to_char((o."canceledAt" + interval '9 hours')::date, 'YYYY-MM-DD') as date,
                 -i.subtotal as amount
          from orders o join order_items i on i."orderId" = o.id
          where i."merchantId" = ${scope}
            and o.status = any(${REFUND_STATUS}::"OrderStatus"[])
            and o."paidAt" is not null and o."canceledAt" >= ${since}
        ) t group by 1 order by 1`
    : await prisma.$queryRaw<{ date: string; revenue: bigint }[]>`
        select date, sum(amount)::bigint as revenue from (
          select to_char((o."paidAt" + interval '9 hours')::date, 'YYYY-MM-DD') as date,
                 o.payable as amount
          from orders o where o."paidAt" >= ${since}
          union all
          select to_char((o."canceledAt" + interval '9 hours')::date, 'YYYY-MM-DD') as date,
                 -o.payable as amount
          from orders o
          where o.status = any(${REFUND_STATUS}::"OrderStatus"[])
            and o."paidAt" is not null and o."canceledAt" >= ${since}
        ) t group by 1 order by 1`;

  return rows.map((r) => ({ date: r.date, revenue: Number(r.revenue) }));
}

/**
 * 단계별 누적 세션 수를 **DB 에서 센다.**
 *
 * 예전에는 기간 안의 퍼널 이벤트를 전부 메모리로 올려 세션별로 묶었다.
 * 지금 데이터로는 아무 문제가 없지만 기간 선택지에 90일이 있고 이벤트
 * 테이블은 방치하면 계속 큰다 — 언젠가 대시보드 한 번에 수십만 행을
 * 서버로 끌어오게 된다. 세는 일은 DB 가 훨씬 잘한다.
 *
 * 비율은 세지 않는다. 그건 core 가 하고(funnelFromCounts), 메모리로 세는
 * 경로와 같은 함수를 쓴다 — 두 벌로 두면 두 화면이 다른 수를 말한다.
 */
async function loadFunnel(since: Date): Promise<FunnelStepResult[]> {
  /*
   * 세션마다 어떤 단계를 밟았는지 bool 로 접은 뒤, 앞 단계를 모두 밟은
   * 세션만 세어 올린다. 단계 이름은 core 의 FUNNEL_STEP 순서를 그대로
   * 쓴다 — 여기서 다시 적으면 순서가 갈릴 수 있다.
   */
  const [step1, step2, step3, step4] = FUNNEL_STEP;

  const rows = await prisma.$queryRaw<
    { s1: bigint; s2: bigint; s3: bigint; s4: bigint }[]
  >`
    select
      count(*) filter (where a) as s1,
      count(*) filter (where a and b) as s2,
      count(*) filter (where a and b and c) as s3,
      count(*) filter (where a and b and c and d) as s4
    from (
      select
        bool_or(name = ${step1}) as a,
        bool_or(name = ${step2}) as b,
        bool_or(name = ${step3}) as c,
        bool_or(name = ${step4}) as d
      from event_logs
      where "receivedAt" >= ${since}
        and name in (${Prisma.join([...FUNNEL_STEP])})
      group by "sessionId"
    ) t
  `;

  const row = rows[0];
  // 기간 안에 이벤트가 하나도 없으면 그룹이 없어 행도 없다
  if (!row) return funnelFromCounts([0, 0, 0, 0]);

  return funnelFromCounts([row.s1, row.s2, row.s3, row.s4].map(Number));
}

