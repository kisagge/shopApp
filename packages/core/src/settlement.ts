import { won, type Won } from './money';

/**
 * 정산 계산과 기간 산정. 순수 함수만 둔다.
 *
 * 정산은 **구매확정을 기준으로** 한다. 결제 시점이 아니라 확정 시점이어야
 * 반품 가능 기간이 지난 돈만 가맹점에 넘어간다.
 */

export const SETTLEMENT_STATUS = ['PENDING', 'CONFIRMED', 'PAID', 'HELD'] as const;
export type SettlementStatus = (typeof SETTLEMENT_STATUS)[number];

export const SETTLEMENT_STATUS_LABEL: Readonly<Record<SettlementStatus, string>> = {
  PENDING: '집계 중',
  CONFIRMED: '확정',
  PAID: '지급 완료',
  HELD: '보류',
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

/** 그 시각이 속한 달의 앞 달 — 정산 배치가 기본으로 도는 대상 */
export function previousYearMonth(now: Date): string {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const year = kst.getUTCFullYear();
  const month = kst.getUTCMonth(); // 0-based 이므로 이미 앞 달
  const target = month === 0 ? { y: year - 1, m: 12 } : { y: year, m: month };
  return `${target.y}-${String(target.m).padStart(2, '0')}`;
}

export interface SettlementAmounts {
  readonly grossAmount: Won;
  readonly commissionAmount: Won;
  readonly refundAmount: Won;
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
 */
export function calculateSettlement(input: {
  gross: Won;
  commissionPercent: number;
  refund: Won;
}): SettlementAmounts {
  if (!Number.isInteger(input.commissionPercent) ||
      input.commissionPercent < 0 || input.commissionPercent > 100) {
    throw new SettlementError(`수수료율은 0~100 사이 정수여야 합니다: ${input.commissionPercent}`);
  }

  const commission = won(Math.floor((input.gross * input.commissionPercent) / 100));

  return {
    grossAmount: input.gross,
    commissionAmount: commission,
    refundAmount: input.refund,
    netAmount: won(input.gross - commission - input.refund),
  };
}
