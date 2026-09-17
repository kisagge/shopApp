import 'server-only';
import { prisma } from '@shop/db';
import {
  won, readOrderSearch, readDateRange, actorLabel,
  type Actor, type Won, type OrderStatus,
  offsetOf,
} from '@shop/core';
import {
  assertAdminQuery, scopeOf, maskName, PAGE_SIZE, MAX_PAGE_SIZE, type Paged,
} from './scope';
import { clampToLastPage } from '../paged';
import { loadActors } from './actors';

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
  /**
   * 취소한 뒤 입금이 들어와 **아직 돌려주지 않은** 주문만. 대시보드의 "처리가 필요한 일" 이 여기로 보낸다.
   * 운영진만 본다 — 가맹점은 결제를 보지 않고, 받은 돈은 플랫폼 계좌에 있다.
   */
  readonly lateDeposit?: boolean | undefined;
}

/**
 * 운영 주문의 조회 조건.
 *
 * **목록과 내보내기가 이것 하나를 쓴다.** 둘로 적으면 반드시 갈린다 — 그리고 갈리는
 * 순간이 하필 가맹점 범위일 수 있다. 화면에는 자기 주문만 보이는데 내려받은
 * 파일에는 남의 가맹점 주문과 그 수령인·주소가 들어 있는 상태다.
 */
/** 취소 뒤 들어왔고 아직 돌려주지 않은 입금. 목록 필터와 대시보드 숫자가 이것 하나를 쓴다 */
export const LATE_DEPOSIT_OPEN = { lateDepositAt: { not: null }, lateDepositResolvedAt: null } as const;

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
    ...(filter.lateDeposit && scope === null ? { payment: { is: LATE_DEPOSIT_OPEN } } : {}),
    ...search,
    ...placedAt,
  };
}

export async function getAdminOrders(
  actor: Actor,
  query: AdminOrderFilter & {
    page?: number;
    take?: number;
  } = {},
): Promise<Paged<AdminOrderRow>> {
  assertAdminQuery(actor, 'order:read');
  const scope = scopeOf(actor);
  const take = Math.min(query.take ?? PAGE_SIZE, MAX_PAGE_SIZE);
  const where = adminOrderWhere(scope, query);

  const page = query.page ?? 1;
  const readAt = (at: number) =>
    prisma.order.findMany({
      where,
      // 같은 시각에 들어온 주문의 순서가 흔들리면 쪽을 넘길 때 행이 겹치거나 빠진다
      orderBy: [{ placedAt: 'desc' }, { id: 'desc' }],
      take,
      skip: offsetOf(at, take),
      select: {
        id: true, orderNo: true, status: true, placedAt: true, payable: true,
        user: { select: { name: true } },
        items: {
          // 가맹점에게는 자기 줄만 보여 준다
          ...(scope ? { where: { merchantId: scope } } : {}),
          select: { productName: true, subtotal: true },
        },
      },
    });

  const [first, total] = await Promise.all([readAt(page), prisma.order.count({ where })]);
  // 즐겨찾기에 담아 둔 쪽은 주문이 보관되면 사라진다 — 빈 표 대신 마지막 쪽을 준다
  const rows = await clampToLastPage(first, { page, pageSize: take, total }, readAt);

  return {
    rows: rows.map((o) => ({
      orderNo: o.orderNo,
      status: o.status,
      placedAt: o.placedAt,
      amount: won(scope ? o.items.reduce((s, i) => s + i.subtotal, 0) : o.payable),
      buyerName: maskName(o.user.name),
      itemCount: o.items.length,
      firstItemName: o.items[0]?.productName ?? '(상품 없음)',
    })),
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
      id: true,
      orderNo: true, status: true, placedAt: true, paidAt: true,
      listTotal: true, productDiscount: true, couponDiscount: true,
      pointsUsed: true, shippingFee: true, payable: true, rewardPoints: true,
      recipient: true, recipientPhone: true, postalCode: true,
      address1: true, address2: true, deliveryMemo: true,
      user: { select: { name: true, email: true, grade: true } },
      payment: {
        select: {
          method: true, status: true, pgProvider: true, pgApprovalNo: true, approvedAt: true,
          // 취소한 주문에 들어온 입금 — 사람이 돌려줘야 한다(lib/admin/late-deposit)
          lateDepositAt: true, lateDepositAmount: true, lateDepositResolvedAt: true,
        },
      },
      shipment: { select: { carrier: true, trackingNumber: true, shippedAt: true } },
      deliveredAt: true,
      returnRequests: {
        orderBy: { requestedAt: 'desc' },
        take: 1,
        select: {
          type: true, reason: true, detail: true, status: true,
          shippingBorneBy: true, rejectReason: true, requestedAt: true, itemIds: true,
          receivedAt: true,
          // 누가 승인·반려했고 누가 도착을 확인했는가 — 적어 두기만 하고 보여 주지 않았다
          receivedBy: true, resolvedBy: true, resolvedAt: true,
          exchangeLines: { select: { orderItemId: true, fromOptionLabel: true, toOptionLabel: true, quantity: true } },
          reshipCarrier: true, reshipTrackingNumber: true, reshippedAt: true,
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

  /*
   * **진행 중인 반품의 줄이 어느 가맹점 것인가.** 가맹점에게는 자기 줄만 내려주므로 화면이 스스로
   * 알 수 없다 — 남의 상품이 섞인 신청에 단추를 세웠다가 누르면 거절된다. 가맹점 id 만 센다(무엇을
   * 샀는지·금액은 새지 않는다).
   */
  const active = order.returnRequests[0];
  const returnMerchantIds = active
    ? (await prisma.orderItem.findMany({
        where: {
          orderId: order.id,
          ...(active.itemIds.length > 0 ? { id: { in: active.itemIds } } : { status: 'RETURN_REQUESTED', canceledAt: null }),
        },
        select: { merchantId: true },
      })).map((i) => i.merchantId)
    : [];

  /*
   * **처리한 사람.** 신청을 누가 승인·반려했고 누가 물건 도착을 확인했는지 적혀 있는데 어느 화면에도 뜨지 않아,
   * 가맹점과 운영진이 함께 다루는 반품에서 "누가 눌렀나" 를 감사 로그에서 찾아야 했다. 가맹점에게는 같은 가맹점
   * 사람만 이름으로, 운영진은 "운영진" 으로 보인다(core actorLabel).
   */
  const people = active ? await loadActors([active.resolvedBy, active.receivedBy]) : new Map();
  const labelOf = (id: string | null) =>
    id === null ? null : actorLabel(actor, { id, identity: people.get(id) ?? null }, '기록 없음');
  const returnPeople = {
    resolved: active ? labelOf(active.resolvedBy) : null,
    received: active ? labelOf(active.receivedBy) : null,
  };

  return {
    ...order,
    returnMerchantIds,
    returnPeople,
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
