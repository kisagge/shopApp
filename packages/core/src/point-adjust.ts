import { rewardExpiresAt } from './reward';

/**
 * 운영진이 손님 적립금을 손으로 지급·차감한다 — 배송 지연 보상, 잘못 준 적립 바로잡기.
 *
 * **사유 없이는 못 한다.** 사유는 손님 적립금 내역에 그대로 보인다 — 잔액이 왜 바뀌었는지 손님이 물을 필요가 없게.
 *
 * **한 번에 줄 수 있는 양에 끝이 있다.** 포인트는 돈이다. 0 을 하나 더 친 실수가 그대로 나가면 되돌리려고 이미 쓴
 * 사람에게서 빼앗아야 한다.
 *
 * **차감은 잔액을 넘지 못한다.** 반품 회수(reclaim-reward)는 모자라면 있는 만큼만 가져가지만, 손으로 하는 차감은
 * 금액을 사람이 정한 것이라 조용히 줄여 처리하면 적은 것과 다른 일이 일어난다 — 막고 지금 잔액을 말한다.
 */

export const POINT_ADJUST_DIRECTION = ['GRANT', 'DEDUCT'] as const;
export type PointAdjustDirection = (typeof POINT_ADJUST_DIRECTION)[number];

/** 한 번에 지급·차감할 수 있는 최대 포인트 */
export const POINT_ADJUST_MAX = 100_000;
/** 사유 길이. 손님 내역 한 줄에 들어가야 한다 */
export const POINT_ADJUST_NOTE_MAX = 100;

export type PointAdjustProblem = 'USER_CLOSED' | 'INSUFFICIENT_POINTS';

export function checkPointAdjust(input: {
  readonly direction: PointAdjustDirection;
  readonly amount: number;
  readonly balance: number;
  readonly closed: boolean;
}): PointAdjustProblem | null {
  // 탈퇴하며 남은 포인트는 정리됐다 — 줄 사람도 뺄 것도 없다
  if (input.closed) return 'USER_CLOSED';
  if (input.direction === 'DEDUCT' && input.amount > input.balance) return 'INSUFFICIENT_POINTS';
  return null;
}

/** 원장에 적을 한 줄. 지급은 적립처럼 유효기간을 갖고, 차감은 갖지 않는다 */
export function pointAdjustEntry(
  direction: PointAdjustDirection,
  amount: number,
  now: Date,
): { readonly amount: number; readonly expiresAt: Date | null } {
  return direction === 'GRANT'
    ? { amount, expiresAt: rewardExpiresAt(now) }
    : { amount: -amount, expiresAt: null };
}
