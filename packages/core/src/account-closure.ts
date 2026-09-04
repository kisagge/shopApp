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

export const CLOSURE_BLOCK_MESSAGE: Readonly<Record<ClosureBlock, string>> = {
  IN_FLIGHT_ORDER: '배송이 끝나지 않은 주문이 있습니다. 받으신 뒤에 탈퇴해 주세요.',
  OPEN_RETURN: '처리 중인 반품이 있습니다. 끝난 뒤에 탈퇴할 수 있습니다.',
  RETURNABLE_ORDER: '아직 반품할 수 있는 주문이 있습니다. 탈퇴하면 반품 신청을 할 수 없게 됩니다.',
  STAFF_ACCOUNT: '가맹점·운영진 계정은 스스로 탈퇴할 수 없습니다. 관리자에게 문의해 주세요.',
};

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

export interface ClosureEffect {
  readonly what: string;
  readonly how: ClosureHandling;
  readonly why?: string;
}

export const CLOSURE_EFFECT: readonly ClosureEffect[] = [
  { what: '이메일 · 이름 · 전화번호', how: 'erase' },
  { what: '배송지 목록', how: 'erase' },
  { what: '장바구니 · 찜 · 재입고 알림', how: 'erase' },
  { what: '보유 쿠폰', how: 'erase' },
  { what: '로그인 수단(비밀번호 · 구글 연결)', how: 'erase' },
  { what: '주문서의 받는 사람 · 연락처 · 주소', how: 'erase' },
  {
    what: '남은 포인트',
    how: 'erase',
    why: '탈퇴와 함께 사라지고 되살릴 수 없습니다',
  },
  {
    what: '주문의 금액 · 상품 · 상태',
    how: 'keep',
    why: '가맹점 정산의 근거입니다. 지우면 이미 지급한 돈의 근거가 사라집니다',
  },
  {
    what: '작성한 리뷰',
    how: 'keep',
    why: '다른 분들이 보고 사는 정보입니다. 이름은 지워집니다 — 함께 지우실 수도 있습니다',
  },
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
