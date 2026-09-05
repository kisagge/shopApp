import type { OrderStatus } from './order-state';
import type { UserRole } from './authz';

/**
 * 회원 탈퇴 규칙. 순수 로직만, I/O 없음.
 *
 * **지우지 않고 지운 것처럼 만든다.**
 *
 * 행을 없애는 쪽이 깔끔해 보이지만 이 도메인에서는 불가능하다. 주문은
 * 가맹점 정산의 근거이고, 주문을 지우면 **남의 정산 내역이 바뀐다.** 이미
 * 지급한 돈의 근거가 사라지는 것이라 되돌릴 방법도 없다. 스키마도 그렇게
 * 말한다 — Order.user 에는 onDelete 가 없어서 DB 가 삭제를 거절한다.
 *
 * 그래서 개인을 가리키는 값만 지우고, 거래의 뼈대는 남긴다.
 */

export const CLOSURE_BLOCK = [
  'IN_FLIGHT_ORDER',
  'OPEN_RETURN',
  'RETURNABLE_ORDER',
  'STAFF_ACCOUNT',
] as const;
export type ClosureBlock = (typeof CLOSURE_BLOCK)[number];

/*
 * 막는 이유의 문구는 여기 없다. 무엇이 막는지는 규칙이고 그것을 어떻게
 * 말할지는 화면이다 — 사전의 `closureBlock.*` 이 세 벌로 가진다.
 */

/** 배송이 끝나지 않은 상태 */
const IN_FLIGHT: readonly OrderStatus[] = ['PENDING', 'PAID', 'PREPARING', 'SHIPPED'];

export interface ClosureOrderState {
  readonly status: OrderStatus;
  /** 반품 기간이 남아 있는가. 판단은 return-request 의 canRequestReturn 이 한다. */
  readonly returnable: boolean;
}

export interface ClosureCheck {
  readonly allowed: boolean;
  readonly blocks: readonly ClosureBlock[];
}

/**
 * 지금 탈퇴할 수 있는가.
 *
 * **막는 이유를 전부 돌려준다.** 하나만 알려 주고 고치면 다음 것이 나오는
 * 화면은 사람을 몇 번이고 다시 오게 만든다.
 */
export function checkClosure(input: {
  readonly role: UserRole;
  readonly orders: readonly ClosureOrderState[];
}): ClosureCheck {
  const blocks: ClosureBlock[] = [];

  /*
   * 가맹점·운영진은 스스로 탈퇴하지 못한다.
   *
   * 가맹점은 정산을 받는 주체라 계정이 사라지면 지급할 곳이 없어지고,
   * 운영진 계정이 조용히 사라지면 감사 로그의 행위자를 되짚을 수 없다.
   */
  if (input.role !== 'CUSTOMER') blocks.push('STAFF_ACCOUNT');

  if (input.orders.some((o) => IN_FLIGHT.includes(o.status))) blocks.push('IN_FLIGHT_ORDER');
  if (input.orders.some((o) => o.status === 'RETURN_REQUESTED')) blocks.push('OPEN_RETURN');
  if (input.orders.some((o) => o.returnable)) blocks.push('RETURNABLE_ORDER');

  return { allowed: blocks.length === 0, blocks };
}

/**
 * 탈퇴하면 무엇이 지워지고 무엇이 남는가.
 *
 * **화면과 코드가 같은 곳을 본다.** 확인 화면에 손으로 적어 두면 둘이
 * 어긋나고, 어긋난 쪽은 언제나 화면이다 — 그러면 "지운다고 했는데 남아
 * 있는" 상황이 된다.
 */
export type ClosureHandling = 'erase' | 'keep';

/**
 * 탈퇴하면 무엇이 어떻게 되는가.
 *
 * **글이 아니라 항목만 적는다.** 이 안내는 화면이 세 나라 말로 보여 주므로,
 * 여기에 한국어 문장을 두면 그 화면만 한국어로 굳는다. 무엇이 지워지고
 * 무엇이 남는지는 규칙이고, 그것을 어떻게 설명할지는 화면이 정한다.
 *
 * `why` 가 있는 항목은 이유까지 말해야 하는 것들이다 — 남는 이유를 적지
 * 않으면 "왜 안 지우느냐" 는 물음만 남는다.
 */
export interface ClosureEffect {
  /** 사전 열쇠의 뒷부분. `closure.<id>` 와 `closure.<id>Why` 로 이어진다. */
  readonly id: string;
  readonly how: ClosureHandling;
  /** 이유까지 보여 줄 항목인가 */
  readonly explains?: boolean;
}

export const CLOSURE_EFFECT: readonly ClosureEffect[] = [
  { id: 'identity', how: 'erase' },
  { id: 'addresses', how: 'erase' },
  { id: 'cartWishRestock', how: 'erase' },
  { id: 'coupons', how: 'erase' },
  { id: 'credentials', how: 'erase' },
  { id: 'orderContact', how: 'erase' },
  { id: 'points', how: 'erase', explains: true },
  { id: 'orderRecord', how: 'keep', explains: true },
  { id: 'reviews', how: 'keep', explains: true },
];

/**
 * 탈퇴 계정이 쓸 값.
 *
 * 이메일은 유니크 제약이 있어 비울 수 없다. `.invalid` 는 예약된 도메인이라
 * (RFC 2606) 실제로 존재할 수 없고, 그래서 **다시 가입한 사람과 겹치지
 * 않는다** — 같은 주소로 다시 가입하는 길도 그대로 열려 있다.
 */
export const CLOSED_ACCOUNT_NAME = '탈퇴한 회원';

export function closedAccountEmail(userId: string): string {
  return `withdrawn-${userId}@removed.invalid`;
}

export function isClosedAccountEmail(email: string): boolean {
  return email.endsWith('@removed.invalid');
}

/** 탈퇴 확인 문구. 버튼 하나로 끝나면 안 되는 동작이다. */
export const CLOSURE_CONFIRM_PHRASE = '탈퇴합니다';

export const CLOSURE_ERROR = {
  BLOCKED: '지금은 탈퇴할 수 없습니다.',
  PHRASE_MISMATCH: `확인 문구를 정확히 입력해 주세요. "${CLOSURE_CONFIRM_PHRASE}"`,
  ALREADY_CLOSED: '이미 탈퇴한 계정입니다.',
} as const;
export type ClosureErrorCode = keyof typeof CLOSURE_ERROR;
