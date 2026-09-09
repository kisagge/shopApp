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
  /*
   * **구매확정은 종착이 아니다.**
   *
   * 확정은 "이대로 받겠다" 는 뜻이라 단순 변심의 길은 여기서 닫힌다. 그런데
   * 물건에 하자가 있거나 다른 것이 왔다면 그건 확정과 무관한 이야기다 —
   * 확정은 사업자 편의로 둔 개념일 뿐, 판매자 귀책까지 사람이 포기한 것은
   * 아니다. 실제로 그렇게 막아 두었더니 하자 신고에 "고객센터로 문의해
   * 주세요" 만 나갔고, 그 뒤는 코드에 없었다.
   *
   * 어떤 사유로 올 수 있는지는 `checkReturnEligibility` 가 정한다 —
   * 상태 기계는 길만 내고 그 길의 조건은 반품 정책이 갖는다.
   */
  CONFIRMED: ['RETURN_REQUESTED'],
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

/**
 * 주문 내역에서 걸러 볼 수 있는 칸.
 *
 * **탭이 열 상태 중 다섯만 덮고 있었다.** 구매확정·취소·반품·환불은 "전체"
 * 에서만 보였는데, 자동 구매확정이 돌면 지난 주문 대부분이 CONFIRMED 가
 * 된다 — 시간이 갈수록 탭이 아무것도 못 걸러 내는 쪽으로 간다.
 *
 * **끝난 것들은 한 칸으로 묶는다.** 취소·반품접수·반품완료·환불완료를 따로
 * 두면 탭이 아홉이 되는데, 사는 사람 입장에서 그 넷은 "무르는 중이거나
 * 물렀다" 하나다. 반면 배송 단계는 지금 어디쯤인지가 곧 궁금한 것이라
 * 하나씩 둔다.
 *
 * 열쇠는 주소에 그대로 실린다. 상태 이름과 겹치지 않게 소문자로 둔다 —
 * `?status=closed` 는 CLOSED 라는 상태가 아니라 묶음이라는 뜻이다.
 */
export const ORDER_FILTER_GROUP = {
  closed: ['CANCELLED', 'RETURN_REQUESTED', 'RETURNED', 'REFUNDED'],
} as const satisfies Readonly<Record<string, readonly OrderStatus[]>>;

export type OrderFilterGroup = keyof typeof ORDER_FILTER_GROUP;

/**
 * 주문 내역 화면의 칸들. 왼쪽부터 이 차례로 놓인다.
 *
 * **여기 두는 이유는 검사 때문이다.** 목록이 화면에 있으면 "어느 상태도
 * 갈 곳이 없어서는 안 된다" 를 아무도 확인할 수 없다 — 실제로 다섯 칸만
 * 있는 채로 나머지 다섯 상태가 "전체" 에서만 보이고 있었다.
 */
export const ORDER_FILTER_TAB = [
  'PENDING', 'PAID', 'PREPARING', 'SHIPPED', 'DELIVERED', 'CONFIRMED', 'closed',
] as const;

export type OrderFilterTab = (typeof ORDER_FILTER_TAB)[number];

export function isOrderFilterGroup(value: string): value is OrderFilterGroup {
  return Object.hasOwn(ORDER_FILTER_GROUP, value);
}

/**
 * 주소에서 온 값을 실제로 걸 상태 목록으로 편다.
 *
 * 하나짜리 상태도 목록으로 돌려준다 — 부르는 쪽이 "하나인가 묶음인가" 를
 * 다시 나누지 않게 하려는 것이다. 모르는 값은 거르지 않는 것과 같다.
 */
export function orderFilterStatuses(value: string | undefined): readonly OrderStatus[] | null {
  if (value === undefined) return null;
  if (isOrderFilterGroup(value)) return ORDER_FILTER_GROUP[value];
  // 상태 판정은 화면 쪽에 흩어져 있었다. 이 함수를 쓰는 곳이 늘면서
  // 여기로 모은다 — 목록이 core 에 있으니 판정도 여기가 맞다.
  return (ORDER_STATUS as readonly string[]).includes(value) ? [value as OrderStatus] : null;
}
