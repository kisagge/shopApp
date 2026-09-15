/**
 * 적립 확정 정책.
 *
 * 순수 함수만 둔다. I/O 없음.
 *
 * 적립은 **주문할 때가 아니라 구매확정할 때** 준다. 주문 시점에 주면
 * 반품·환불된 주문의 적립까지 나가고, 그걸 되돌리려면 이미 쓴 포인트를
 * 회수해야 하는데 그건 대개 불가능하다. 확정된 뒤에 주면 되돌릴 일이 없다.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 적립 포인트의 유효 기간(일).
 *
 * 무기한으로 두면 부채가 계속 쌓이고, 회계상 언제 털어야 할지 알 수 없다.
 * 국내 커머스는 대개 1년을 쓴다.
 */
export const REWARD_VALID_DAYS = 365;

/**
 * 배송완료 후 며칠이면 자동으로 구매확정하는가.
 *
 * 자동 확정이 없으면 주문은 배송완료에 머물고 적립도 영원히 안 나간다.
 * 대부분의 사람은 확정 버튼을 누르지 않는다.
 *
 * 반품 신청 기한(단순 변심 7일)보다 **길게** 잡는다. 확정되면 반품 신청
 * 창구가 닫히므로, 기한이 남았는데 먼저 확정돼 버리면 안 된다.
 */
export const AUTO_CONFIRM_DAYS = 8;

/** 적립분의 소멸 예정일 */
export function rewardExpiresAt(grantedAt: Date, days = REWARD_VALID_DAYS): Date {
  return new Date(grantedAt.getTime() + days * DAY_MS);
}

/**
 * 이 주문을 지금 자동 확정해도 되는가.
 *
 * 배송완료 상태이고, 그로부터 정해진 날이 지났고, 반품 신청이 걸려 있지
 * 않아야 한다. **반품 신청 중인 주문을 확정하면 안 된다** — 확정은 되돌릴
 * 수 없는데 반품은 아직 판단 전이다.
 */
export function isAutoConfirmable(input: {
  readonly status: string;
  readonly deliveredAt: Date | null;
  readonly hasOpenReturn: boolean;
  readonly now: Date;
  readonly days?: number;
}): boolean {
  if (input.status !== 'DELIVERED') return false;
  if (input.deliveredAt === null) return false;
  if (input.hasOpenReturn) return false;

  const due = input.deliveredAt.getTime() + (input.days ?? AUTO_CONFIRM_DAYS) * DAY_MS;
  return input.now.getTime() >= due;
}

/**
 * 손님이 직접 구매확정할 수 있는가.
 *
 * 자동 확정과 조건이 같되 **기한을 기다리지 않는다** — 받아 보고 마음에 들었으면 적립을 며칠 기다릴 이유가 없다.
 * 배송완료여야 하고(상태 규칙상 확정은 배송완료에서만 간다), 처리 전인 반품 신청이 없어야 한다.
 */
export function canConfirmPurchase(input: { readonly status: string; readonly hasOpenReturn: boolean }): boolean {
  return input.status === 'DELIVERED' && !input.hasOpenReturn;
}

/**
 * 실제로 지급할 적립 포인트.
 *
 * **주문에 저장해 둔 값을 쓴다.** 주문 당시의 등급과 금액으로 계산해
 * "확정 시 N포인트 적립" 이라고 이미 약속한 값이다. 확정 시점에 다시
 * 계산하면 그 사이 등급이 내려간 사람은 약속보다 덜 받게 된다.
 *
 * 0 이하면 지급하지 않는다 — 0원짜리 원장 줄은 잔액에 영향도 없으면서
 * 내역만 어지럽힌다.
 */
export function rewardToGrant(orderRewardPoints: number): number {
  return orderRewardPoints > 0 ? orderRewardPoints : 0;
}
