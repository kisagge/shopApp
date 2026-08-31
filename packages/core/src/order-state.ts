/**
 * 주문 상태 전이. 어떤 상태에서 어디로 갈 수 있는지를 한곳에 모아 두면
 * 어드민 액션·웹훅·배치가 각자 판단해서 어긋나는 일을 막을 수 있다.
 */
export const ORDER_STATUS = [
  'PENDING',           // 입금대기 (가상계좌)
  'PAID',              // 결제완료
  'PREPARING',         // 배송준비
  'SHIPPED',           // 배송중
  'DELIVERED',         // 배송완료
  'CONFIRMED',         // 구매확정 — 적립 확정, 환불 불가
  'CANCELLED',         // 주문취소
  'RETURN_REQUESTED',  // 반품접수
  'RETURNED',          // 반품완료
  'REFUNDED',          // 환불완료
] as const;

export type OrderStatus = (typeof ORDER_STATUS)[number];

export const ORDER_STATUS_LABEL: Readonly<Record<OrderStatus, string>> = {
  PENDING: '입금대기',
  PAID: '결제완료',
  PREPARING: '배송준비',
  SHIPPED: '배송중',
  DELIVERED: '배송완료',
  CONFIRMED: '구매확정',
  CANCELLED: '주문취소',
  RETURN_REQUESTED: '반품접수',
  RETURNED: '반품완료',
  REFUNDED: '환불완료',
};

const TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  PENDING: ['PAID', 'CANCELLED'],
  PAID: ['PREPARING', 'CANCELLED'],
  PREPARING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'RETURN_REQUESTED'],
  DELIVERED: ['CONFIRMED', 'RETURN_REQUESTED'],
  CONFIRMED: [],
  CANCELLED: ['REFUNDED'],
  RETURN_REQUESTED: ['RETURNED', 'SHIPPED'], // 반품 철회 시 배송중으로 되돌림
  RETURNED: ['REFUNDED'],
  REFUNDED: [],
};

export class OrderTransitionError extends Error {
  constructor(
    readonly from: OrderStatus,
    readonly to: OrderStatus,
  ) {
    super(
      `주문 상태를 ${ORDER_STATUS_LABEL[from]}에서 ${ORDER_STATUS_LABEL[to]}(으)로 바꿀 수 없습니다.`,
    );
    this.name = 'OrderTransitionError';
  }
}

export const nextStatuses = (from: OrderStatus): readonly OrderStatus[] => TRANSITIONS[from];

export const canTransition = (from: OrderStatus, to: OrderStatus): boolean =>
  TRANSITIONS[from].includes(to);

export function transition(from: OrderStatus, to: OrderStatus): OrderStatus {
  if (!canTransition(from, to)) throw new OrderTransitionError(from, to);
  return to;
}

/** 더 이상 상태가 바뀌지 않는 종착 상태 */
export const isTerminal = (status: OrderStatus): boolean => TRANSITIONS[status].length === 0;

/** 고객이 스스로 취소할 수 있는 구간 — 출고 전까지 */
export const isCancellableByCustomer = (status: OrderStatus): boolean =>
  status === 'PENDING' || status === 'PAID';

/** 재고를 붙잡고 있는 상태. 재고 복원 판단에 쓴다. */
export const holdsInventory = (status: OrderStatus): boolean =>
  status === 'PENDING' || status === 'PAID' || status === 'PREPARING' ||
  status === 'SHIPPED' || status === 'DELIVERED' || status === 'CONFIRMED';

/**
 * 이행 경로의 진행 순서.
 *
 * 한 주문에 여러 가맹점 상품이 섞이면 줄마다 상태가 달라진다. 그때
 * **주문 전체의 상태는 가장 뒤처진 줄이 정한다** — 한 가맹점이 출고했다고
 * 주문 전체가 배송중이 되면, 아직 준비 중인 다른 상품까지 배송중으로 보인다.
 *
 * 취소·반품처럼 갈래로 빠진 상태는 이 순서에 넣지 않는다. 일부만 취소된
 * 주문의 전체 상태는 별도 정책이 필요하고, 순서로 답할 문제가 아니다.
 */
const FULFILLMENT_RANK: Readonly<Partial<Record<OrderStatus, number>>> = {
  PENDING: 0,
  PAID: 1,
  PREPARING: 2,
  SHIPPED: 3,
  DELIVERED: 4,
  CONFIRMED: 5,
};

/**
 * 여러 줄 중 가장 뒤처진 상태를 돌려준다.
 *
 * 이행 경로 밖의 상태(취소·반품 등)가 섞여 있으면 null 이다 —
 * 그건 순서로 답할 수 없고 호출부가 따로 판단해야 한다.
 */
export function slowestFulfillmentStatus(
  statuses: readonly OrderStatus[],
): OrderStatus | null {
  if (statuses.length === 0) return null;

  let slowest: OrderStatus | null = null;
  let slowestRank = Number.POSITIVE_INFINITY;

  for (const status of statuses) {
    const rank = FULFILLMENT_RANK[status];
    if (rank === undefined) return null;
    if (rank < slowestRank) {
      slowestRank = rank;
      slowest = status;
    }
  }
  return slowest;
}
