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
