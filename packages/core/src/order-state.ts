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
 * 송장을 붙일 수 있는 주문인가.
 *
 * **이 함수가 없어서 아무 주문에나 붙었다.** 송장 등록은 상태 전이보다 **먼저**
 * 저장하고, 전이가 실패하면 그 오류를 삼켰다. 삼키는 것 자체는 뜻이 있었다 —
 * 이미 배송 중인 주문의 송장 오타를 고치러 온 사람을 막으면 안 된다. 그런데
 * 그 예외가 **모든 실패한 전이**에 걸려서, 취소·환불된 주문에도 송장이 붙었다.
 * 고객 화면은 송장이 있으면 운송 조회를 그리므로, 취소한 주문에 배송 조회가
 * 뜬다.
 *
 * 결제완료도 마찬가지로 잘못 열려 있었다. 결제완료에서 배송중으로 가는 길은
 * 없는데(배송준비를 거쳐야 한다) 화면에는 "송장 등록하고 배송 시작" 이 떴고,
 * 누르면 송장만 쓰이고 상태는 그대로였다 — 단추 이름이 거짓말을 했다.
 *
 * 그래서 둘로 나눈다. **보낼 수 있는 상태**이거나, **이미 보낸 것을 고치는
 * 경우**만 허용한다.
 */
/** 여기서 송장을 붙이면 배송이 시작된다 */
const READY_TO_SHIP: readonly OrderStatus[] = ['PREPARING'];

/** 이미 보낸 것 — 송장 오타를 고치러 올 수 있다 */
const ALREADY_SHIPPED: readonly OrderStatus[] = ['SHIPPED', 'DELIVERED', 'CONFIRMED'];

/**
 * **전이표에서 유도하지 않는다.** `canTransition(status, 'SHIPPED')` 로 쓰면
 * 반품접수까지 열린다 — 전이표에 그 길이 있는 것은 **반품을 반려할 때** 왔던
 * 자리로 되돌리기 위해서지, 거기서 새로 보내라는 뜻이 아니다. 송장 등록이
 * 그 길의 뒷문이 되면 반려 사유도 없이 상태만 배송중으로 돌아간다.
 *
 * 같은 이름의 전이라도 **누가 왜 하느냐가 다르면 다른 문**이다.
 */
export const canRegisterShipment = (status: OrderStatus): boolean =>
  READY_TO_SHIP.includes(status) || ALREADY_SHIPPED.includes(status);

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
 * 이행 경로에서 갈래로 빠지는 상태들.
 *
 * 순위표에 없는 것이 곧 갈래다 — 손으로 적으면 상태가 하나 늘 때 여기만
 * 빠진다.
 */
const BRANCH_STATUS: readonly OrderStatus[] = ORDER_STATUS.filter(
  (status) => FULFILLMENT_RANK[status] === undefined,
);

/**
 * 줄들의 상태로 주문 전체의 상태를 정한다.
 *
 * `slowestFulfillmentStatus` 는 **이행 경로만** 답한다. 취소·반품처럼 갈래로
 * 빠진 상태가 섞이면 null 을 주고 "호출부가 따로 판단하라" 고 말하는데,
 * **호출부가 판단하지 않았다.** 어드민의 상태 변경은 null 을 받으면 주문을
 * 그냥 안 옮겼고, 그래서 이런 일이 벌어졌다.
 *
 * - 반품 승인 뒤 **반품완료로 바꿀 수 없었다.** 줄만 반품완료가 되고 주문은
 *   반품접수에 남는다. 그다음 환불은 `반품접수 → 환불완료` 전이가 없어서
 *   막히므로, **반품 승인을 받은 주문은 영영 환불되지 않았다.**
 * - 그러면서 화면은 "다른 가맹점 상품이 남아 주문 전체 상태는 아직
 *   그대로입니다" 라고 말했다. 가맹점이 하나뿐인 주문에도 그렇게 말했다 —
 *   기다릴 상대가 없는데 기다리라고 한 것이다.
 *
 * 그래서 갈래에도 답을 준다. **모든 줄이 같은 갈래에 도달했을 때만** 주문이
 * 그 갈래로 간다. 일부만 취소·반품된 주문은 여전히 null 이다 — 그건 부분
 * 취소라는 별도 정책이 필요한 이야기지, 여기서 고를 문제가 아니다.
 */
export function orderStatusFromItems(
  all: readonly OrderStatus[],
): OrderStatus | null {
  /*
   * **부분 취소한 줄은 셈에서 뺀다.** 세 줄 중 하나를 출고 전에 취소하고 둘을 보냈으면
   * 주문은 배송중이다. 빼지 않으면 취소가 갈래라서 "모든 줄이 같은 갈래" 가 아니게 되고,
   * 주문이 결제완료에 영영 머문다. 전부 취소됐으면 그대로 취소다.
   */
  const live = all.filter((status) => status !== 'CANCELLED');
  const statuses = live.length === 0 ? all : live;
  const [first] = statuses;
  if (first !== undefined && BRANCH_STATUS.includes(first)) {
    return statuses.every((status) => status === first) ? first : null;
  }
  return slowestFulfillmentStatus(statuses);
}

/**
 * 어드민의 **상태 변경 단추**로 지날 수 있는 길.
 *
 * 전이표에 있어도 **이 문으로 지나가면 안 되는** 길이 있다.
 * `반품접수 → 배송중·배송완료·구매확정` 이 그렇다. 그 길을 낸 이유는 반품을
 * **반려**할 때 왔던 자리로 되돌리기 위해서지, 상태 단추로 되감으라는 뜻이
 * 아니다. 단추로 지나가면 반품 신청은 접수된 채 남고 주문만 배송중으로
 * 돌아간다 — 그 뒤에 승인해도 반품완료로 갈 길이 없어 **신청이 영영 처리되지
 * 않는다.**
 *
 * `canRegisterShipment` 와 같은 이야기다. **같은 이름의 전이라도 누가 왜
 * 하느냐가 다르면 다른 문이다.**
 *
 * 표에서 걸러 낸다. 손으로 적으면 표가 바뀔 때 여기만 남는다.
 */
export const adminStatusActions = (from: OrderStatus): readonly OrderStatus[] =>
  from === 'RETURN_REQUESTED'
    ? nextStatuses(from).filter((to) => to === 'RETURNED')
    : nextStatuses(from);

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
