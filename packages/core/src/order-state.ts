import type { PaymentStatusCode } from './payment';

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
  /*
   * 반려하면 **왔던 자리로** 되돌린다.
   *
   * 예전에는 배송중 하나뿐이었다. 반품이 배송중·배송완료에서만 올 수 있었고,
   * 배송완료였더라도 배송중으로 갔다가 다시 배송완료로 갈 수 있으니 막다른
   * 길은 아니었다.
   *
   * **구매확정에서도 올 수 있게 되면서 그 단순화가 깨졌다.** 확정된 주문을
   * 배송중으로 되돌리면 사람에게는 이미 받은 물건이 "배송중" 으로 보이고,
   * 더 나쁜 것은 다시 확정될 때 `confirmedAt` 이 덮인다는 점이다 — 그 값이
   * 정산 매출의 축이라, 이미 지급한 달의 매출이 다른 달로 옮겨간다.
   *
   * 어디로 되돌릴지는 `statusBeforeReturn` 이 정한다.
   */
  RETURN_REQUESTED: ['RETURNED', 'SHIPPED', 'DELIVERED', 'CONFIRMED'],
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

/**
 * 결제를 다시 걸 수 있는 주문인가.
 *
 * **이 함수가 생긴 이유는 사람이 갇혔기 때문이다.** 승인이 실패하면 주문은
 * 만들어진 채 PENDING 으로 남는데, 그때 화면은 "주문 내역에서 다시 시도할
 * 수 있습니다" 라고 말하면서 정작 다시 걸 길을 주지 않았다. 실제로 배포에서
 * 주문 20260910-7063897 이 그렇게 갇혔고, 할 수 있는 것은 취소뿐이었다.
 *
 * **주문 상태만으로는 못 정한다.** PENDING 은 두 가지를 함께 가리킨다 —
 * 승인이 안 된 것과, 가상계좌를 받아 입금을 기다리는 것. 뒤엣것에 "다시
 * 결제하기" 를 주면 이미 받은 계좌를 버리고 새로 발급하게 되고, 그 사이에
 * 옛 계좌로 넣은 돈은 갈 곳이 없어진다. 그래서 결제 상태를 함께 본다.
 *
 * `null` 은 결제 행이 아직 없는 경우다 — 그것도 다시 걸어야 할 자리다.
 */
export const isRepayable = (
  status: OrderStatus,
  paymentStatus: PaymentStatusCode | null,
): boolean => {
  if (status !== 'PENDING') return false;
  if (paymentStatus === null) return true;
  // 입금을 기다리는 중이면 할 일은 송금이지 재결제가 아니다
  return paymentStatus === 'READY' || paymentStatus === 'ABORTED' || paymentStatus === 'FAILED';
};

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

/**
 * 반품 신청이 어느 자리에서 왔는가.
 *
 * 신청을 반려할 때 **왔던 자리로** 되돌리려고 쓴다. 따로 기록하지 않고
 * 주문이 이미 들고 있는 시각으로 되짚는다 — 그 시각들이 곧 "이 주문이
 * 어디까지 갔었는가" 의 기록이다.
 *
 * 되돌릴 때 그 시각들을 **다시 쓰지 않는다.** 확정 시각은 정산 매출의
 * 축이라, 덮으면 이미 지급한 달의 매출이 다른 달로 옮겨간다.
 */
export function statusBeforeReturn(order: {
  readonly confirmedAt: Date | null | undefined;
  readonly deliveredAt: Date | null | undefined;
}): OrderStatus {
  /*
   * 값이 **없으면 없는 것으로 본다.** 처음에는 `!== null` 로 적었는데, 값을
   * 빠뜨린 자리에서 `undefined` 가 오자 "확정됨" 으로 읽혔다 — 확정된 적
   * 없는 주문을 확정으로 되돌리는 쪽이라 위험한 방향이다. 틀리려면
   * 덜 나아간 쪽으로 틀려야 한다.
   */
  if (order.confirmedAt) return 'CONFIRMED';
  if (order.deliveredAt) return 'DELIVERED';
  return 'SHIPPED';
}
