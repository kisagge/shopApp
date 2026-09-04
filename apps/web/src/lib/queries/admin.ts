import 'server-only';
import { prisma, Prisma } from '@shop/db';
import {
  merchantScope, computeFunnel, won, FUNNEL_STEP, assertPermission,
  rangeStart, DASHBOARD_RANGE_LABEL, RAW_RETENTION_DAYS, recentMonths, dayKeyOf,
  type Actor, type Won, type OrderStatus, type FunnelStepResult, type DashboardRange,
  readOrderSearch, readDateRange,
  type ProductStatus,
} from '@shop/core';

/**
 * 어드민 조회.
 *
 * **모든 쿼리가 merchantScope 를 통과한다.** 가맹점은 자기 상품이 들어간
 * 주문과 자기 브랜드의 상품만 본다. 화면에서 메뉴를 가리는 것으로는 부족하다 —
 * 데이터를 가져오는 쪽에서 막아야 한다.
 *
 * 매출도 마찬가지다. 가맹점의 매출은 주문 총액이 아니라 **그 가맹점 상품 줄의
 * 합계**다. 한 주문에 여러 가맹점 상품이 섞이기 때문이다.
 */

/** 매출로 잡는 주문 상태 — 결제가 성립한 것부터 */
const REVENUE_STATUSES: readonly OrderStatus[] = [
  'PAID', 'PREPARING', 'SHIPPED', 'DELIVERED', 'CONFIRMED',
];

export class ScopeError extends Error {
  constructor() {
    super('조회 권한이 없습니다.');
    this.name = 'ScopeError';
  }
}

/** undefined 면 아무것도 볼 수 없다는 뜻이라 던진다 */
function scopeOf(actor: Actor): string | null {
  const scope = merchantScope(actor);
  if (scope === undefined) throw new ScopeError();
  return scope;
}

export interface DashboardKpi {
  readonly revenue: Won;
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
  const scope = scopeOf(actor);

  /**
   * 기간의 시작. 오늘을 포함해서 센다.
   *
   * 90일까지만 고를 수 있다 — 원본 이벤트 보존 기간과 같다. 더 긴 구간을
   * 원본에서 세면 지워진 날이 조용히 0으로 잡혀 트래픽이 줄어든 것처럼 보인다.
   */
  const since = rangeStart(range, now);

  const orderWhere = (from: Date) => ({
    status: { in: [...REVENUE_STATUSES] },
    placedAt: { gte: from },
    ...(scope ? { items: { some: { merchantId: scope } } } : {}),
  });

  const [todayAgg, todayItems, todo, topRows, recent, daily, funnel] = await Promise.all([
    prisma.order.aggregate({
      where: orderWhere(since),
      _count: { _all: true },
      _sum: { payable: true },
    }),
    // 가맹점 매출은 자기 줄의 합계다
    scope
      ? prisma.orderItem.aggregate({
          where: { merchantId: scope, order: orderWhere(since) },
          _sum: { subtotal: true },
        })
      : Promise.resolve(null),
    loadTodo(scope),
    loadTopProducts(scope, since),
    loadRecentOrders(scope),
    loadDailyRevenue(scope, since),
    scope === null ? loadFunnel(since) : Promise.resolve(null),
  ]);

  const revenue = won(
    scope ? (todayItems?._sum.subtotal ?? 0) : (todayAgg._sum.payable ?? 0),
  );
  const orderCount = todayAgg._count._all;

  return {
    scope,
    range,
    rangeLabel:
      range === '1d' ? '오늘' : `최근 ${DASHBOARD_RANGE_LABEL[range]}`,
    period: {
      revenue,
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
      order: { status: { in: [...REVENUE_STATUSES] }, placedAt: { gte: since } },
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

/** 주문자 이름은 가운데를 가린다. 운영에 필요한 건 식별이지 전체 이름이 아니다. */
function maskName(name: string): string {
  if (name.length <= 1) return name;
  if (name.length === 2) return `${name[0]}○`;
  return `${name[0]}${'○'.repeat(name.length - 2)}${name.at(-1)}`;
}

async function loadDailyRevenue(scope: string | null, since: Date): Promise<DailyRevenue[]> {
  // groupBy 로는 날짜 단위 집계가 안 되므로 raw 를 쓴다.
  // KST 로 변환해 자르지 않으면 한국 시간 오전 9시 전 주문이 전날에 붙는다.
  const rows = scope
    ? await prisma.$queryRaw<{ date: string; revenue: bigint }[]>`
        select to_char((o."placedAt" + interval '9 hours')::date, 'YYYY-MM-DD') as date,
               sum(i.subtotal)::bigint as revenue
        from orders o join order_items i on i."orderId" = o.id
        where i."merchantId" = ${scope}
          and o.status = any(${REVENUE_STATUSES}::"OrderStatus"[])
          and o."placedAt" >= ${since}
        group by 1 order by 1`
    : await prisma.$queryRaw<{ date: string; revenue: bigint }[]>`
        select to_char((o."placedAt" + interval '9 hours')::date, 'YYYY-MM-DD') as date,
               sum(o.payable)::bigint as revenue
        from orders o
        where o.status = any(${REVENUE_STATUSES}::"OrderStatus"[])
          and o."placedAt" >= ${since}
        group by 1 order by 1`;

  return rows.map((r) => ({ date: r.date, revenue: Number(r.revenue) }));
}

/** 세션별로 어떤 퍼널 단계를 밟았는지 모아 core 의 computeFunnel 에 넘긴다 */
async function loadFunnel(since: Date): Promise<FunnelStepResult[]> {
  const rows = await prisma.eventLog.findMany({
    where: { name: { in: [...FUNNEL_STEP] }, receivedAt: { gte: since } },
    select: { sessionId: true, name: true },
  });

  const bySession = new Map<string, string[]>();
  for (const r of rows) {
    const list = bySession.get(r.sessionId);
    if (list) list.push(r.name);
    else bySession.set(r.sessionId, [r.name]);
  }

  return computeFunnel([...bySession].map(([sessionId, names]) => ({ sessionId, names })));
}

// ── 장기 트래픽 추이 (접힌 값) ────────────────────────────────

export interface MonthlyTraffic {
  /** 'YYYY-MM' */
  readonly month: string;
  /** 상품 조회 이벤트 수 */
  readonly viewItems: number;
  /** 장바구니 담기 이벤트 수 */
  readonly addToCarts: number;
  /** 결제 완료 이벤트 수 */
  readonly purchases: number;
  /** 조회 대비 결제 비율(%). 소수 첫째 자리 */
  readonly conversionRate: number;
}

export interface TrafficHistory {
  readonly months: readonly MonthlyTraffic[];
  /** 원본이 남아 있는 가장 이른 날. 이보다 앞은 접힌 값만 있다. */
  readonly rawSince: string;
}

/**
 * 월별 트래픽. **접힌 값(EventDaily)에서 읽는다.**
 *
 * 원본은 90일이 지나면 지워지므로 그보다 긴 구간은 여기서만 볼 수 있다.
 * 이 표가 접힌 값을 읽는 유일한 자리이고, 롤업이 존재하는 이유다.
 *
 * **세션 수를 쓰지 않는다.** 접힌 세션 수는 하루 단위 고유값이라 날짜끼리
 * 더하면 이틀에 걸쳐 온 세션이 두 번 세어진다. 여기서는 날짜끼리 더해도
 * 되는 **이벤트 수**만 쓰고, 전환율도 이벤트 기준이라고 이름에 적는다.
 * 세션 기준 전환율이 필요하면 90일 안쪽에서 퍼널을 봐야 한다.
 */
export async function getTrafficHistory(
  actor: Actor,
  monthCount = 12,
  now: Date = new Date(),
): Promise<TrafficHistory> {
  // 전체 트래픽 지표다. 가맹점에게는 주지 않는다.
  assertPermission(actor, 'analytics:all');

  const months = recentMonths(now, monthCount);
  const oldest = months.at(-1)!;
  const rows = await prisma.eventDaily.findMany({
    where: {
      day: { gte: new Date(`${oldest}-01T00:00:00.000Z`) },
      name: { in: ['view_item', 'add_to_cart', 'purchase'] },
    },
    select: { day: true, name: true, events: true },
  });

  const byMonth = new Map<string, { view_item: number; add_to_cart: number; purchase: number }>();
  for (const month of months) byMonth.set(month, { view_item: 0, add_to_cart: 0, purchase: 0 });

  for (const row of rows) {
    // DATE 컬럼은 UTC 자정으로 저장돼 있고 그 값이 곧 KST 날짜다
    const month = row.day.toISOString().slice(0, 7);
    const bucket = byMonth.get(month);
    if (!bucket) continue;
    bucket[row.name as keyof typeof bucket] += row.events;
  }

  return {
    months: months.map((month) => {
      const b = byMonth.get(month)!;
      return {
        month,
        viewItems: b.view_item,
        addToCarts: b.add_to_cart,
        purchases: b.purchase,
        conversionRate:
          b.view_item === 0 ? 0 : Math.round((b.purchase / b.view_item) * 1000) / 10,
      };
    }),
    rawSince: dayKeyOf(new Date(now.getTime() - RAW_RETENTION_DAYS * 24 * 60 * 60 * 1000)),
  };
}

void Prisma;

// ── 주문 ──────────────────────────────────────────────────────

export interface AdminOrderRow {
  readonly orderNo: string;
  readonly status: OrderStatus;
  readonly placedAt: Date;
  readonly amount: Won;
  readonly buyerName: string;
  readonly itemCount: number;
  readonly firstItemName: string;
}

/**
 * 목록 한 쪽.
 *
 * 커서로 넘긴다. 어드민 목록은 계속 자라고, offset 은 뒤로 갈수록 느려질 뿐
 * 아니라 보는 사이 앞에 행이 끼어들면 같은 행을 두 번 보여 준다.
 * total 은 따로 센다 — 화면 상단의 "N건" 이 한 쪽 크기가 되면 안 된다.
 */
export interface Paged<T> {
  readonly rows: readonly T[];
  readonly nextCursor: string | null;
  readonly total: number;
}

const PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 50;

export async function getAdminOrders(
  actor: Actor,
  query: {
    status?: OrderStatus | undefined;
    cursor?: string | undefined;
    take?: number;
    /** 주문번호이거나 주문자 이름. 어느 쪽인지는 core 가 판단한다 */
    q?: string | undefined;
    from?: string | undefined;
    to?: string | undefined;
  } = {},
): Promise<Paged<AdminOrderRow>> {
  const scope = scopeOf(actor);
  const take = Math.min(query.take ?? PAGE_SIZE, MAX_PAGE_SIZE);

  const term = readOrderSearch(query.q);
  const range = readDateRange(query.from, query.to);

  /**
   * 검색 조건은 **범위 제한과 AND 로 묶인다.**
   *
   * 가맹점은 자기 상품이 든 주문만 볼 수 있는데, 검색을 OR 로 얹으면 그
   * 제한이 풀려 남의 주문이 나온다. 조건을 늘릴 때 가장 쉽게 깨지는 자리다.
   */
  const search =
    term.kind === 'orderNo'
      ? { orderNo: term.value }
      : term.kind === 'orderNoPartial'
        ? { orderNo: { contains: term.value } }
        : term.kind === 'buyer'
          ? { user: { name: { contains: term.value, mode: 'insensitive' as const } } }
          : {};

  const placedAt =
    range.from || range.until
      ? {
          placedAt: {
            ...(range.from ? { gte: range.from } : {}),
            ...(range.until ? { lt: range.until } : {}),
          },
        }
      : {};

  const where = {
    ...(query.status ? { status: query.status } : {}),
    ...(scope ? { items: { some: { merchantId: scope } } } : {}),
    ...search,
    ...placedAt,
  };

  const [rows, total] = await Promise.all([
    prisma.order.findMany({
      where,
      // 같은 시각에 들어온 주문의 순서가 흔들리면 커서가 행을 건너뛴다
      orderBy: [{ placedAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true, orderNo: true, status: true, placedAt: true, payable: true,
        user: { select: { name: true } },
        items: {
          // 가맹점에게는 자기 줄만 보여 준다
          ...(scope ? { where: { merchantId: scope } } : {}),
          select: { productName: true, subtotal: true },
        },
      },
    }),
    prisma.order.count({ where }),
  ]);

  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;

  return {
    rows: page.map((o) => ({
      orderNo: o.orderNo,
      status: o.status,
      placedAt: o.placedAt,
      amount: won(scope ? o.items.reduce((s, i) => s + i.subtotal, 0) : o.payable),
      buyerName: maskName(o.user.name),
      itemCount: o.items.length,
      firstItemName: o.items[0]?.productName ?? '(상품 없음)',
    })),
    nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
    total,
  };
}

export async function getAdminOrder(actor: Actor, orderNo: string) {
  const scope = scopeOf(actor);

  const order = await prisma.order.findFirst({
    where: {
      orderNo,
      ...(scope ? { items: { some: { merchantId: scope } } } : {}),
    },
    select: {
      orderNo: true, status: true, placedAt: true, paidAt: true,
      listTotal: true, productDiscount: true, couponDiscount: true,
      pointsUsed: true, shippingFee: true, payable: true, rewardPoints: true,
      recipient: true, recipientPhone: true, postalCode: true,
      address1: true, address2: true, deliveryMemo: true,
      user: { select: { name: true, email: true, grade: true } },
      payment: { select: { method: true, status: true, pgProvider: true, pgApprovalNo: true, approvedAt: true } },
      shipment: { select: { carrier: true, trackingNumber: true, shippedAt: true } },
      deliveredAt: true,
      returnRequests: {
        orderBy: { requestedAt: 'desc' },
        take: 1,
        select: {
          type: true, reason: true, detail: true, status: true,
          shippingBorneBy: true, rejectReason: true, requestedAt: true,
        },
      },
      items: {
        ...(scope ? { where: { merchantId: scope } } : {}),
        select: {
          productName: true, brandName: true, optionLabel: true,
          listPrice: true, unitPrice: true, quantity: true, subtotal: true, status: true,
        },
      },
      statusLogs: {
        orderBy: { createdAt: 'asc' },
        select: { from: true, to: true, actor: true, note: true, createdAt: true },
      },
    },
  });
  if (!order) return null;

  return {
    ...order,
    // 주문자 개인정보는 가맹점에게 최소한만 준다. 배송에 필요한 건
    // 이름과 연락처지 이메일이 아니다.
    user: scope
      ? { name: maskName(order.user.name), email: null, grade: order.user.grade }
      : { name: order.user.name, email: order.user.email, grade: order.user.grade },
    /** 가맹점이 보는 금액은 자기 줄의 합계다 */
    scopedTotal: won(scope ? order.items.reduce((s, i) => s + i.subtotal, 0) : order.payable),
    isScoped: scope !== null,
  };
}

// ── 상품 ──────────────────────────────────────────────────────

export interface AdminProductRow {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly brandName: string;
  readonly categoryName: string;
  readonly listPrice: Won;
  readonly salePrice: Won | null;
  readonly status: string;
  readonly totalStock: number;
  readonly lowStock: boolean;
  readonly createdAt: Date;
  /** 검수를 요청한 시각. 대기줄 정렬에 쓴다. */
  readonly reviewRequestedAt: Date | null;
  readonly publishRejection: string | null;
}

export async function getAdminProducts(
  actor: Actor,
  query: { cursor?: string | undefined; take?: number; status?: ProductStatus | undefined } = {},
): Promise<Paged<AdminProductRow> & { readonly awaitingReview: number }> {
  const scope = scopeOf(actor);
  const take = Math.min(query.take ?? PAGE_SIZE, MAX_PAGE_SIZE);

  const scoped = { deletedAt: null, ...(scope ? { brand: { merchantId: scope } } : {}) };
  const where = { ...scoped, ...(query.status ? { status: query.status } : {}) };

  const [rows, total] = await Promise.all([
    prisma.product.findMany({
    where,
    /*
     * 검수 대기만 보고 있을 때는 **오래 기다린 것부터** 꺼낸다. 다른
     * 목록과 같은 최신순으로 두면 새로 들어온 요청이 계속 앞을 막는다.
     */
    orderBy:
      query.status === 'PENDING_REVIEW'
        ? [{ reviewRequestedAt: 'asc' as const }, { id: 'asc' as const }]
        : [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
    take: take + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    select: {
      id: true, slug: true, name: true, listPrice: true, salePrice: true,
      status: true, createdAt: true, reviewRequestedAt: true, publishRejection: true,
      brand: { select: { name: true } },
      category: { select: { name: true } },
      variants: { select: { stock: true }, where: { isActive: true } },
    },
    }),
    prisma.product.count({ where }),
  ]);

  // 탭에 붙는 숫자. 필터와 무관하게 범위 안의 대기 건수를 센다.
  const awaitingReview = await prisma.product.count({
    where: { ...scoped, status: 'PENDING_REVIEW' },
  });

  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;

  return {
    rows: page.map((p) => ({
      id: p.id, slug: p.slug, name: p.name,
      brandName: p.brand.name, categoryName: p.category.name,
      listPrice: won(p.listPrice),
      salePrice: p.salePrice === null ? null : won(p.salePrice),
      status: p.status,
      totalStock: p.variants.reduce((s, v) => s + v.stock, 0),
      lowStock: p.variants.some((v) => v.stock > 0 && v.stock <= 5),
      createdAt: p.createdAt,
      reviewRequestedAt: p.reviewRequestedAt,
      publishRejection: p.publishRejection,
    })),
    nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
    total,
    awaitingReview,
  };
}

// ── 정산 ──────────────────────────────────────────────────────

export interface SettlementRow {
  readonly id: string;
  readonly merchantName: string;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly grossAmount: Won;
  readonly commissionAmount: Won;
  readonly refundAmount: Won;
  readonly netAmount: Won;
  readonly status: string;
}

export async function getSettlements(actor: Actor): Promise<SettlementRow[]> {
  const scope = scopeOf(actor);

  const rows = await prisma.settlement.findMany({
    where: scope ? { merchantId: scope } : {},
    orderBy: { periodEnd: 'desc' },
    take: 24,
    select: {
      id: true, periodStart: true, periodEnd: true,
      grossAmount: true, commissionAmount: true, refundAmount: true, netAmount: true,
      status: true,
      merchant: { select: { name: true } },
    },
  });

  return rows.map((s) => ({
    id: s.id,
    merchantName: s.merchant.name,
    periodStart: s.periodStart,
    periodEnd: s.periodEnd,
    grossAmount: won(s.grossAmount),
    commissionAmount: won(s.commissionAmount),
    refundAmount: won(s.refundAmount),
    netAmount: won(s.netAmount),
    status: s.status,
  }));
}


// ── 상품 상세 (수정 화면) ──────────────────────────────────────

export interface AdminProductDetail {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly brandId: string;
  readonly brandName: string;
  readonly categoryId: string;
  readonly categoryName: string;
  readonly listPrice: Won;
  readonly salePrice: Won | null;
  readonly status: string;
  /** 지난 반려 사유. 고치는 화면에서 보여야 무엇을 고칠지 안다. */
  readonly publishRejection: string | null;
  readonly variants: readonly {
    readonly id: string;
    readonly sku: string;
    readonly optionLabel: string;
    readonly stock: number;
    readonly isActive: boolean;
  }[];
}

export async function getAdminProductDetail(
  actor: Actor,
  productId: string,
): Promise<AdminProductDetail | null> {
  const scope = scopeOf(actor);

  const p = await prisma.product.findFirst({
    where: {
      id: productId,
      deletedAt: null,
      ...(scope ? { brand: { merchantId: scope } } : {}),
    },
    select: {
      id: true, slug: true, name: true, description: true,
      listPrice: true, salePrice: true, status: true, publishRejection: true,
      brand: { select: { id: true, name: true } },
      category: { select: { id: true, name: true } },
      variants: {
        orderBy: { sku: 'asc' },
        select: { id: true, sku: true, label: true, stock: true, isActive: true },
      },
    },
  });
  if (!p) return null;

  return {
    id: p.id, slug: p.slug, name: p.name, description: p.description,
    brandId: p.brand.id, brandName: p.brand.name,
    categoryId: p.category.id, categoryName: p.category.name,
    listPrice: won(p.listPrice),
    salePrice: p.salePrice === null ? null : won(p.salePrice),
    status: p.status,
    publishRejection: p.publishRejection,
    variants: p.variants.map((v) => ({
      id: v.id, sku: v.sku, optionLabel: v.label, stock: v.stock, isActive: v.isActive,
    })),
  };
}

// ── 가맹점·회원 (슈퍼관리자 화면) ─────────────────────────────

export interface MerchantRow {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly businessName: string;
  readonly businessNumber: string;
  readonly representative: string;
  readonly contactEmail: string;
  readonly contactPhone: string;
  readonly commissionPercent: number;
  readonly brandNames: readonly string[];
  /** 신청서에 적은 브랜드 이름. 운영진이 직접 만든 가맹점에는 없다. */
  readonly appliedBrandName: string | null;
  /** 신청한 사람. 승인하면 이 계정이 가맹점 계정이 된다. */
  readonly applicant: { readonly name: string; readonly email: string } | null;
  readonly userCount: number;
  readonly approvedAt: Date | null;
  readonly createdAt: Date;
}

export async function getMerchants(actor: Actor): Promise<MerchantRow[]> {
  const scope = scopeOf(actor);

  const rows = await prisma.merchant.findMany({
    // 가맹점 계정은 자기 정보만 본다
    where: scope ? { id: scope } : {},
    // 승인 대기가 위로 와야 할 일이 눈에 띈다
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 100,
    select: {
      id: true, name: true, status: true,
      businessName: true, businessNumber: true, representative: true,
      contactEmail: true, contactPhone: true, commissionPercent: true,
      approvedAt: true, createdAt: true,
      // 신청으로 들어온 건인지, 운영진이 직접 만든 것인지 구분한다
      brandName: true,
      applicant: { select: { name: true, email: true } },
      brands: { select: { name: true } },
      _count: { select: { users: true } },
    },
  });

  return rows.map((m) => ({
    id: m.id, name: m.name, status: m.status,
    businessName: m.businessName,
    // 사업자번호는 뒤 두 자리만 가린다. 대조에는 쓰되 그대로 흘리지는 않는다.
    businessNumber: m.businessNumber.replace(/\d{2}$/, '**'),
    representative: m.representative,
    contactEmail: m.contactEmail,
    contactPhone: m.contactPhone,
    commissionPercent: m.commissionPercent,
    brandNames: m.brands.map((b) => b.name),
    appliedBrandName: m.brandName,
    applicant: m.applicant,
    userCount: m._count.users,
    approvedAt: m.approvedAt,
    createdAt: m.createdAt,
  }));
}

export interface AdminUserRow {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: string;
  readonly merchantId: string | null;
  readonly merchantName: string | null;
  readonly orderCount: number;
  readonly createdAt: Date;
  /** 탈퇴 시각. 행은 남으므로 목록에서 구분할 수 있어야 한다. */
  readonly closedAt: Date | null;
}

export interface AdminUserPage {
  readonly rows: readonly AdminUserRow[];
  readonly nextCursor: string | null;
}

export async function getAdminUsers(
  actor: Actor,
  query: { q?: string | undefined; cursor?: string | undefined; take?: number } = {},
): Promise<AdminUserPage> {
  assertPermission(actor, 'user:read');

  const take = Math.min(query.take ?? 25, 50);
  const q = query.q?.trim();

  const rows = await prisma.user.findMany({
    where: q
      ? {
          OR: [
            { email: { contains: q, mode: 'insensitive' } },
            { name: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {},
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: take + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    select: {
      id: true, name: true, email: true, role: true, createdAt: true, deletedAt: true,
      merchant: { select: { id: true, name: true } },
      _count: { select: { orders: true } },
    },
  });

  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;

  return {
    rows: page.map((u) => ({
      id: u.id, name: u.name, email: u.email, role: u.role,
      merchantId: u.merchant?.id ?? null,
      merchantName: u.merchant?.name ?? null,
      orderCount: u._count.orders,
      createdAt: u.createdAt,
      closedAt: u.deletedAt,
    })),
    nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
  };
}

/** 권한 부여 폼이 쓰는 가맹점 선택지 — 승인된 곳만 */
export async function getApprovedMerchants(
  actor: Actor,
): Promise<readonly { id: string; name: string }[]> {
  assertPermission(actor, 'user:assignRole');
  return prisma.merchant.findMany({
    where: { status: 'APPROVED' },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
}
