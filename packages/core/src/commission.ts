import type { Actor } from './authz';
import { hasPermission } from './authz';

/**
 * 수수료율.
 *
 * 스키마에는 가맹점마다 칸이 있었는데 **바꿀 길이 시드밖에 없었다.** 조건을 새로 협의해도 코드를 고쳐 다시 시드해야 했고,
 * 그건 운영이 아니라 배포다.
 */

/**
 * 받을 수 있는 요율의 폭.
 *
 * 0 은 둔다 — 입점 초기에 수수료를 안 받는 조건이 실제로 있다. 위는 50 에서 끊는다: 절반을 넘게 떼는 조건은 폼에 숫자를
 * 적어 넣을 일이 아니라 따로 이야기할 일이고, 0 하나를 더 눌러 5% 를 50% 로 만드는 실수가 여기서 걸린다.
 */
export const COMMISSION_MIN_PERCENT = 0;
export const COMMISSION_MAX_PERCENT = 50;

export function isCommissionPercent(value: unknown): value is number {
  return (
    typeof value === 'number'
    && Number.isInteger(value)
    && value >= COMMISSION_MIN_PERCENT
    && value <= COMMISSION_MAX_PERCENT
  );
}

/**
 * 수수료율을 바꿀 수 있는가.
 *
 * **입점을 승인하는 사람이 조건도 정한다**(`merchant:approve` — 슈퍼관리자). 관리자에게 주지 않는 것은 정산 지급을
 * 주지 않은 것과 같은 이유다: 요율은 곧 플랫폼이 가져가는 몫이라, 한 사람이 요율을 내리고 지급까지 집행할 수 있으면
 * 나눠 둔 뜻이 없어진다.
 *
 * **가맹점은 당연히 못 고친다.** 자기 몫을 자기가 정하는 것이 된다.
 */
export function canEditCommission(actor: Actor): boolean {
  return hasPermission(actor, 'merchant:approve');
}

/**
 * 이 요율이 실제로 적용되는 시점.
 *
 * **이미 확정한 정산은 건드리지 않는다.** 확정은 그때의 숫자를 얼리는 일이고(settlement 의 commissionPercent),
 * 요율을 바꿨다고 지난달 지급액이 달라지면 그건 정산이 아니다.
 *
 * 그래서 새 요율은 **아직 확정하지 않은 기간**부터 적용된다. 달 중간에 바꾸면 그 달 전체가 새 요율로 계산된다는 뜻이라,
 * 화면이 그 사실을 먼저 말해야 한다.
 */
export function commissionAppliesFrom(now: Date): string {
  const kst = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit',
  });
  return kst.format(now).slice(0, 7);
}
