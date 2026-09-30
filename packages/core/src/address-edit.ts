import type { OrderStatus } from './order-state';

/**
 * 주문의 배송지를 고칠 수 있는가.
 *
 * **아무도 못 고쳤다.** 손님도 운영자도 창구가 없어서, 상세주소를 잘못 적으면 취소하고 다시 사거나
 * (쿠폰·적립금이 다시 계산되고 재고가 잠깐 풀린다) 1:1 문의로 부탁해야 했다. 운영자도 화면에서 할 수
 * 없으니 결국 DB 를 직접 만졌고, 그사이 송장이 나가면 오배송이다.
 *
 * **고칠 수 있는 때는 출고 전까지다.** 송장이 나간 뒤에는 물건이 이미 옛 주소로 가고 있어서, 주문에
 * 적힌 주소만 바꾸면 화면과 현실이 갈린다.
 *
 * **도서산간 여부가 바뀌면 배송비가 따라 움직인다.** 그런데 돈이 이미 잡힌 뒤에는 그 차액을 주고받을
 * 길이 없다 — 더 받아야 하면 추가 결제가 필요하고, 돌려줘야 하면 부분 환불이다. 그래서 **돈이 굳기
 * 전에만** 권역이 바뀌는 수정을 받는다. 같은 권역 안에서 고치는 것(상세주소 오타·받는 사람 변경)은
 * 언제든 된다 — 실제로 가장 흔한 경우가 그것이다.
 */

export type AddressEditBlock =
  /** 이미 보냈다. 물건이 옛 주소로 가고 있다 */
  | 'ALREADY_SHIPPED'
  /** 끝난 주문(취소·환불·반품 진행 중) */
  | 'ORDER_CLOSED'
  /** 결제가 끝난 뒤에 권역이 바뀐다 — 차액을 주고받을 길이 없다 */
  | 'ZONE_CHANGE_AFTER_PAYMENT'
  /** 발급된 가상계좌 금액은 고정이다 */
  | 'ZONE_CHANGE_ON_DEPOSIT';

/** 배송지를 아직 고칠 수 있는 주문 상태 — 출고 전이고 끝나지 않았다 */
const EDITABLE_STATUS: readonly OrderStatus[] = ['PENDING', 'PAID', 'PREPARING'];

export function checkAddressEdit(input: {
  readonly status: OrderStatus;
  /** 돈이 이미 잡혔는가(승인·입금 완료) */
  readonly settled: boolean;
  /** 가상계좌를 발급받아 입금을 기다리는 중인가 */
  readonly awaitingDeposit: boolean;
  /** 지금 주소의 도서산간 여부 */
  readonly wasRemote: boolean;
  /** 새 주소의 도서산간 여부 */
  readonly nowRemote: boolean;
}): AddressEditBlock | null {
  if (input.status === 'SHIPPED' || input.status === 'DELIVERED' || input.status === 'CONFIRMED') {
    return 'ALREADY_SHIPPED';
  }
  if (!EDITABLE_STATUS.includes(input.status)) return 'ORDER_CLOSED';

  // 권역이 그대로면 돈이 움직이지 않는다. 언제든 고칠 수 있다.
  if (input.wasRemote === input.nowRemote) return null;

  /*
   * 계좌는 금액과 함께 발급됐다. 그 금액을 바꾸면 손님이 입금할 숫자와 우리가 기다리는 숫자가 갈린다 —
   * 덜 들어오면 주문이 영영 안 열리고, 더 들어오면 돌려줘야 한다.
   */
  if (input.awaitingDeposit) return 'ZONE_CHANGE_ON_DEPOSIT';
  if (input.settled) return 'ZONE_CHANGE_AFTER_PAYMENT';

  return null;
}

/**
 * 권역이 바뀌어 달라지는 배송비.
 *
 * **바뀐 것만 셈한다.** 기본 배송비와 무료 기준은 담긴 상품이 정하는데 주소를 고쳐도 그건 그대로다.
 * 그사이 운영이 정책을 바꿨더라도 여기서 같이 반영하면, 주소만 고쳤는데 다른 금액까지 따라 움직인다.
 */
export function remoteSurchargeDelta(input: {
  readonly wasRemote: boolean;
  readonly nowRemote: boolean;
  /** 지금 정책의 도서산간 추가 배송비 */
  readonly surcharge: number;
}): number {
  if (input.wasRemote === input.nowRemote) return 0;
  return input.nowRemote ? input.surcharge : -input.surcharge;
}

/** 주문에 적힌 배송지 한 벌. 고치기 전과 뒤를 견줄 때 쓴다 */
export interface OrderAddressFields {
  readonly recipient: string;
  readonly phone: string;
  readonly postalCode: string;
  readonly address1: string;
  readonly address2: string | null;
  readonly memo: string | null;
}

export const ADDRESS_FIELD = [
  'recipient', 'phone', 'postalCode', 'address1', 'address2', 'memo',
] as const;
export type AddressField = (typeof ADDRESS_FIELD)[number];

/**
 * 무엇이 바뀌었는가.
 *
 * **출고 직전에 주소가 바뀌면 운영자는 알 길이 없었다.** 화면에는 새 주소가 보이지만, 피킹 목록을
 * 이미 뽑았거나 송장을 붙이려던 사람에게는 그 사실이 어디에도 나타나지 않는다 — 처리 이력에 한 줄이
 * 남아야 "언제 무엇이 바뀌었는지" 를 그 자리에서 볼 수 있다.
 *
 * **바뀐 칸만 고른다.** 주소 한 벌을 그대로 적으면 이력이 길어져서 정작 달라진 것을 못 찾고,
 * 바뀐 것이 없으면 빈 목록이다 — 같은 값을 다시 저장한 것은 이력에 남길 일이 아니다.
 */
export function changedAddressFields(
  before: OrderAddressFields,
  after: OrderAddressFields,
): readonly AddressField[] {
  return ADDRESS_FIELD.filter((field) => (before[field] ?? '') !== (after[field] ?? ''));
}
