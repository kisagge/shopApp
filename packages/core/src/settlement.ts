import { won, type Won } from './money';

/**
 * 정산 계산과 기간 산정. 순수 함수만 둔다.
 *
 * 정산은 **구매확정을 기준으로** 한다. 결제 시점이 아니라 확정 시점이어야
 * 반품 가능 기간이 지난 돈만 가맹점에 넘어간다.
 */

export const SETTLEMENT_STATUS = ['PENDING', 'CONFIRMED', 'PAID', 'HELD', 'CARRIED'] as const;
export type SettlementStatus = (typeof SETTLEMENT_STATUS)[number];

export const SETTLEMENT_STATUS_LABEL: Readonly<Record<SettlementStatus, string>> = {
  PENDING: '집계 중',
  CONFIRMED: '확정',
  PAID: '지급 완료',
  HELD: '보류',
  CARRIED: '다음 달로 이월',
};

/** 확정된 정산은 다시 집계하지 않는다. 지급된 것은 더더욱. */
export function isRecalculable(status: SettlementStatus): boolean {
  return status === 'PENDING' || status === 'HELD';
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export interface SettlementPeriod {
  /** 'YYYY-MM' */
  readonly yearMonth: string;
  /** 그 달 1일 00:00 KST (UTC 인스턴트) */
  readonly start: Date;
  /** 다음 달 1일 00:00 KST. **끝은 포함하지 않는다** */
  readonly end: Date;
}

const YEAR_MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

export class SettlementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SettlementError';
  }
}

/**
 * 'YYYY-MM' 을 KST 월 경계로 바꾼다.
 *
 * 경계를 UTC 로 잡으면 매달 1일 오전 9시 이전에 확정된 주문이 앞 달로
 * 넘어간다. 정산 기간이 하루 어긋나면 그 달 매출이 통째로 틀어진다.
 */
export function settlementPeriod(yearMonth: string): SettlementPeriod {
  const match = YEAR_MONTH.exec(yearMonth);
  if (!match) throw new SettlementError(`정산 기간 형식이 잘못됐습니다: ${yearMonth}`);

  const year = Number(match[1]);
  const month = Number(match[2]);

  // KST 자정 = 그날 UTC 15:00 (전날). Date.UTC 로 만든 뒤 9시간을 뺀다.
  const start = new Date(Date.UTC(year, month - 1, 1) - KST_OFFSET_MS);
  const end = new Date(Date.UTC(year, month, 1) - KST_OFFSET_MS);

  return { yearMonth, start, end };
}

/** 지금 기준으로 이미 끝난 기간인가. 진행 중인 달을 확정하면 매출이 잘린다. */
export function isClosedPeriod(period: SettlementPeriod, now: Date): boolean {
  return now.getTime() >= period.end.getTime();
}

/**
 * 그 시각이 속한 달 — KST 기준 'YYYY-MM'.
 *
 * 정산 행은 기간의 시작 시각만 들고 다닌다(periodStart). 그 행을 두고 사람에게
 * 말을 걸려면 "2026-08 정산" 처럼 달 이름이 필요한데, 그 시각은 8월 1일 00:00
 * KST = 7월 31일 15:00 UTC 다 — UTC 로 읽으면 한 달 전을 말하게 된다.
 */
export function yearMonthOf(instant: Date): string {
  const kst = new Date(instant.getTime() + KST_OFFSET_MS);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** 그 시각이 속한 달의 앞 달 — 정산 배치가 기본으로 도는 대상 */
export function previousYearMonth(now: Date): string {
  // 이 달 1일 KST 의 한 순간 전 = 앞 달의 마지막 순간. 12월→1월 넘김을 따로 적지 않는다.
  return yearMonthOf(new Date(settlementPeriod(yearMonthOf(now)).start.getTime() - 1));
}

/**
 * 마감 결과를 그 가맹점에게 알릴 만한가.
 *
 * **마감은 판 것이 없는 가맹점에도 한 줄을 쓴다** — 그 달 장부는 0원이라도 있어야
 * 내려받은 정산 파일의 합이 맞는다. 하지만 장부에 필요한 것과 사람에게 할 말은
 * 다르다. 쉬고 있는 가맹점에 매달 "0원이 확정되었습니다" 가 가면, 그 알림함은
 * 읽을 것이 없는 곳이 되어 정작 돈이 오간 달의 알림까지 함께 지나친다.
 *
 * 환불만 있어 지급액이 음수인 달은 **알린다.** 오간 것이 없어서 0원인 것과
 * 물러난 돈이 있어서 마이너스인 것은 전혀 다른 소식이다.
 */
export const settlementWorthTelling = (amounts: {
  readonly grossAmount: Won;
  readonly refundAmount: Won;
}): boolean => amounts.grossAmount !== 0 || amounts.refundAmount !== 0;

export interface SettlementAmounts {
  readonly grossAmount: Won;
  readonly commissionAmount: Won;
  readonly refundAmount: Won;
  /** 앞선 달에서 넘어온 음수 지급액의 합(0 이하) */
  readonly carriedAmount: Won;
  readonly netAmount: Won;
}

/**
 * 지급액 계산.
 *
 * 수수료는 **환불을 빼기 전 매출에** 매긴다. 환불된 주문의 수수료도 함께
 * 돌려주려면 그 주문의 수수료를 따로 알아야 하는데, 여기서는 환불액을
 * 그대로 차감하는 방식을 쓴다 — 즉 환불분 수수료는 플랫폼이 돌려준다.
 * 소수점은 버려서 가맹점에게 유리한 쪽으로 둔다.
 *
 * 환불이 매출을 넘으면 지급액은 음수가 된다. 0 으로 막지 않는 이유는
 * **다음 달로 넘길 채무가 사라지기 때문**이다. 숫자가 음수인 편이 정확하다.
 *
 * **넘긴다는 말만 있고 넘기는 곳이 없었다.** 음수로 확정된 달은 지급이 막힌 채 남았고, 다음 달은 그 빚을 모른 채
 * 제 금액을 보냈다. 이제 앞선 달의 음수(`carried`, 0 이하)를 이 달 지급액에 더한다 — 그래도 음수면 또 넘어간다.
 */
export function calculateSettlement(input: {
  gross: Won;
  commissionPercent: number;
  refund: Won;
  /** 앞선 달에서 넘어온 음수 지급액의 합. 0 이하만 받는다 */
  carried?: Won;
}): SettlementAmounts {
  if (!Number.isInteger(input.commissionPercent) ||
      input.commissionPercent < 0 || input.commissionPercent > 100) {
    throw new SettlementError(`수수료율은 0~100 사이 정수여야 합니다: ${input.commissionPercent}`);
  }

  const carried = input.carried ?? won(0);
  if (carried > 0) {
    // 넘어오는 것은 빚뿐이다. 양수가 오면 어디선가 지급할 돈을 두 번 세고 있다
    throw new SettlementError(`넘어온 금액은 0 이하여야 합니다: ${carried}`);
  }

  const commission = won(Math.floor((input.gross * input.commissionPercent) / 100));

  return {
    grossAmount: input.gross,
    commissionAmount: commission,
    refundAmount: input.refund,
    carriedAmount: carried,
    netAmount: won(input.gross - commission - input.refund + carried),
  };
}

/**
 * 다음 달로 넘길 정산인가 — 확정됐고 지급액이 음수다.
 *
 * 지급·보류된 것은 넘기지 않는다. 이미 넘겨진 것(CARRIED)도 다시 넘기지 않는다 — 두 번 빼면 가맹점이 손해를 본다.
 */
export const isCarryable = (settlement: { readonly status: SettlementStatus; readonly netAmount: number }): boolean =>
  settlement.status === 'CONFIRMED' && settlement.netAmount < 0;

/** 지급할 수 있는가 — 확정됐고 지급액이 0 이상이다. 음수는 다음 확정 때 넘어간다 */
export const isPayable = (settlement: { readonly status: SettlementStatus; readonly netAmount: number }): boolean =>
  settlement.status === 'CONFIRMED' && settlement.netAmount >= 0;

/**
 * 지급 보류·해제로 옮길 상태.
 *
 * **보류 상태는 있었는데 보류할 길이 없었다.** 확정된 정산에 문제가 보여도(가맹점 분쟁, 계좌 확인 중) 지급 단추는
 * 그대로 살아 있었다. 확정된 것만 보류하고, 보류된 것만 푼다 — 지급·이월된 것을 보류하면 이미 끝난 일을 멈춘 척한다.
 * 보류된 달은 지급할 수 없고(isPayable), 다시 확정하면 금액을 새로 센다(isRecalculable).
 */
export function settlementHoldTarget(current: SettlementStatus, hold: boolean): SettlementStatus {
  if (hold && current === 'CONFIRMED') return 'HELD';
  if (!hold && current === 'HELD') return 'CONFIRMED';
  throw new SettlementError(
    hold ? `확정된 정산만 보류할 수 있습니다(지금: ${current})` : `보류된 정산만 풀 수 있습니다(지금: ${current})`,
  );
}
