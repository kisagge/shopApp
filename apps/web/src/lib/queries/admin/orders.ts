import 'server-only';
import { prisma } from '@shop/db';
import {
  won, readOrderSearch, readDateRange,
  type Actor, type Won, type OrderStatus,
} from '@shop/core';
import {
  assertAdminQuery, scopeOf, maskName, PAGE_SIZE, MAX_PAGE_SIZE, type Paged,
} from './scope';

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
  assertAdminQuery(actor, 'order:read');
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
  assertAdminQuery(actor, 'order:read');
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

