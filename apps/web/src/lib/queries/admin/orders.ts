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

export interface AdminOrderFilter {
  readonly status?: OrderStatus | undefined;
  /** 주문번호이거나 주문자 이름. 어느 쪽인지는 core 가 판단한다 */
  readonly q?: string | undefined;
  readonly from?: string | undefined;
  readonly to?: string | undefined;
}

/**
 * 운영 주문의 조회 조건.
 *
 * **목록과 내보내기가 이것 하나를 쓴다.** 둘로 적으면 반드시 갈린다 — 그리고 갈리는
 * 순간이 하필 가맹점 범위일 수 있다. 화면에는 자기 주문만 보이는데 내려받은
 * 파일에는 남의 가맹점 주문과 그 수령인·주소가 들어 있는 상태다.
 */
export function adminOrderWhere(scope: string | null, filter: AdminOrderFilter) {
  const term = readOrderSearch(filter.q);
  const range = readDateRange(filter.from, filter.to);

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

  return {
    ...(filter.status ? { status: filter.status } : {}),
    ...(scope ? { items: { some: { merchantId: scope } } } : {}),
    ...search,
    ...placedAt,
  };
}

export async function getAdminOrders(
  actor: Actor,
  query: AdminOrderFilter & {
    cursor?: string | undefined;
    take?: number;
  } = {},
): Promise<Paged<AdminOrderRow>> {
  assertAdminQuery(actor, 'order:read');
  const scope = scopeOf(actor);
  const take = Math.min(query.take ?? PAGE_SIZE, MAX_PAGE_SIZE);
  const where = adminOrderWhere(scope, query);

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
          shippingBorneBy: true, rejectReason: true, requestedAt: true, itemIds: true,
        },
      },
      // 돌려준 돈. 가맹점에게는 주문 전체의 환불액이라 내려주지 않는다(아래에서 비운다)
      refunds: {
        orderBy: { createdAt: 'asc' },
        select: { kind: true, amount: true, points: true, shippingDeducted: true, reason: true, createdAt: true },
      },
      items: {
        ...(scope ? { where: { merchantId: scope } } : {}),
        orderBy: { id: 'asc' },
        select: {
          id: true, canceledAt: true,
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
    /*
     * 주문자 개인정보는 가맹점에게 최소한만 준다.
     *
     * 배송에 필요한 것은 **받는 사람**의 이름·연락처·주소지, 주문한 계정의
     * 이름이나 이메일이 아니다. 둘은 다를 수 있다(선물).
     *
     * 등급도 뺀다. 우리 적립·할인 제도의 값이라 가맹점이 알 이유가 없고,
     * 알면 손님을 등급으로 다르게 대할 여지만 생긴다.
     */
    user: scope
      ? { name: maskName(order.user.name), email: null, grade: null }
      : { name: order.user.name, email: order.user.email, grade: order.user.grade },
    /*
     * 한 주문에 여러 가맹점이 섞이면 환불액은 남의 줄 몫까지 합친 값이다. 가맹점에게는
     * 자기 줄이 취소됐는지(줄 상태)만 보인다.
     */
    refunds: scope ? [] : order.refunds,
    /** 가맹점이 보는 금액은 자기 줄의 합계다. 취소된 줄은 판 것이 아니다 */
    scopedTotal: won(
      scope
        ? order.items.filter((i) => !i.canceledAt).reduce((s, i) => s + i.subtotal, 0)
        : order.payable,
    ),
    isScoped: scope !== null,
  };
}

// ── 내보내기 ──────────────────────────────────────────────────

/**
 * 한 번에 내려받을 수 있는 줄 수.
 *
 * **끊어서 말한다.** 넘치면 조용히 잘라서 주면 운영자는 그게 전부인 줄 알고 그만큼만
 * 보낸다 — 나머지 주문은 아무도 모르게 발송이 안 된다. 넘으면 조건을 좁히라고
 * 돌려보낸다.
 */
export const EXPORT_MAX_ROWS = 5_000;

export class ExportTooLargeError extends Error {
  constructor(readonly rows: number) {
    super(`내려받을 줄이 ${rows.toLocaleString('ko-KR')}개로 한도(${EXPORT_MAX_ROWS.toLocaleString('ko-KR')})를 넘습니다. 기간이나 상태로 좁혀 주세요.`);
    this.name = 'ExportTooLargeError';
  }
}

export interface AdminOrderExportRow {
  readonly orderNo: string;
  readonly placedAt: Date;
  readonly status: OrderStatus;
  /** 받는 사람. **배송에 필요한 값이라 가맹점에게도 준다** — 주문 상세와 같은 선이다 */
  readonly recipient: string;
  readonly recipientPhone: string;
  readonly postalCode: string;
  readonly address: string;
  readonly deliveryMemo: string | null;
  readonly productName: string;
  readonly optionLabel: string;
  readonly quantity: number;
  readonly subtotal: Won;
  readonly carrier: string | null;
  readonly trackingNumber: string | null;
}

/**
 * 주문 **항목** 하나당 한 줄로 내려준다.
 *
 * 포장과 출고는 상품 단위로 한다. 주문 하나를 한 줄로 접으면 "코트 외 2건" 이 되고,
 * 그걸 받아 든 사람은 무엇을 박스에 넣어야 할지 모른다.
 *
 * **손님 계정의 값은 없다.** 주문자 이름·이메일·등급은 배송에 필요 없고, 가맹점에게
 * 나가면 안 되는 값이다(admin-privacy). 받는 사람의 이름·연락처·주소는 그 일을
 * 하려면 반드시 있어야 하므로 준다.
 *
 * **가맹점에게는 자기 항목만.** 한 주문에 여러 가맹점이 섞이면, 남의 줄까지 내려주면
 * 남의 상품을 포장하게 된다.
 */
export async function exportAdminOrders(
  actor: Actor,
  filter: AdminOrderFilter,
): Promise<AdminOrderExportRow[]> {
  assertAdminQuery(actor, 'order:read');
  const scope = scopeOf(actor);
  const where = adminOrderWhere(scope, filter);

  const itemWhere = scope ? { merchantId: scope } : {};

  const rows = await prisma.orderItem.count({ where: { order: where, ...itemWhere } });
  if (rows > EXPORT_MAX_ROWS) throw new ExportTooLargeError(rows);

  const orders = await prisma.order.findMany({
    where,
    orderBy: [{ placedAt: 'desc' }, { id: 'desc' }],
    select: {
      orderNo: true, placedAt: true, status: true,
      recipient: true, recipientPhone: true, postalCode: true,
      address1: true, address2: true, deliveryMemo: true,
      shipment: { select: { carrier: true, trackingNumber: true } },
      items: {
        where: itemWhere,
        orderBy: { id: 'asc' },
        select: { productName: true, optionLabel: true, quantity: true, subtotal: true },
      },
    },
  });

  return orders.flatMap((o) =>
    o.items.map((i) => ({
      orderNo: o.orderNo,
      placedAt: o.placedAt,
      status: o.status,
      recipient: o.recipient,
      recipientPhone: o.recipientPhone,
      postalCode: o.postalCode,
      address: [o.address1, o.address2].filter(Boolean).join(' '),
      deliveryMemo: o.deliveryMemo,
      productName: i.productName,
      optionLabel: i.optionLabel,
      quantity: i.quantity,
      subtotal: won(i.subtotal),
      carrier: o.shipment?.carrier ?? null,
      trackingNumber: o.shipment?.trackingNumber ?? null,
    })),
  );
}
