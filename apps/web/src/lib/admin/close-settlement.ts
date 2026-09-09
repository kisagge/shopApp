import 'server-only';
import { prisma } from '@shop/db';
import {
  assertPermission, calculateSettlement, settlementPeriod, isClosedPeriod, isRecalculable,
  won, REFUND_STATUS, SETTLEMENT_SALE_STATUS,
  type Actor, type Won, type SettlementStatus,
} from '@shop/core';

/**
 * 정산 확정.
 *
 * 지금까지 정산 화면은 "구매확정된 전체 매출"을 매번 다시 계산해 보여 줬다.
 * 그건 대시보드지 정산이 아니다. **정산은 특정 기간의 숫자를 한 번 얼려서
 * 남기는 일**이고, 나중에 상품 가격이나 수수료율이 바뀌어도 그 숫자는
 * 그대로여야 한다.
 */

export class SettlementCloseError extends Error {
  constructor(readonly code: string, readonly status: number, message: string) {
    super(message);
    this.name = 'SettlementCloseError';
  }
}

export interface SettlementDraft {
  readonly merchantId: string;
  readonly merchantName: string;
  readonly commissionPercent: number;
  readonly grossAmount: Won;
  readonly commissionAmount: Won;
  readonly refundAmount: Won;
  readonly netAmount: Won;
  readonly orderCount: number;
  /** 이미 확정된 기간이면 그 상태 */
  readonly existingStatus: SettlementStatus | null;
}

/** 한 기간의 가맹점별 정산 초안을 계산한다. 쓰지 않는다. */
export async function previewSettlements(
  actor: Actor,
  yearMonth: string,
): Promise<readonly SettlementDraft[]> {
  assertPermission(actor, 'settlement:read');
  const period = settlementPeriod(yearMonth);

  const merchants = await prisma.merchant.findMany({
    // 해지된 가맹점도 그 기간에 판 것이 있으면 정산해야 한다
    where: actor.merchantId ? { id: actor.merchantId } : {},
    orderBy: { name: 'asc' },
    select: { id: true, name: true, commissionPercent: true },
  });

  const [sales, refunds, existing] = await Promise.all([
    // 구매확정 시점 기준. 결제 시점으로 잡으면 반품 가능 기간이 지나지 않은
    // 돈까지 가맹점에 넘어간다.
    prisma.orderItem.groupBy({
      by: ['merchantId'],
      where: {
        merchantId: { not: null },
        order: { status: SETTLEMENT_SALE_STATUS, confirmedAt: { gte: period.start, lt: period.end } },
      },
      _sum: { subtotal: true },
      _count: { _all: true },
    }),
    /*
     * 빼는 것은 **이미 지급한 적 있는 돈뿐이다.**
     *
     * 전에는 `paidAt` 만 봤다. 그런데 정산 매출로 잡는 것은 구매확정된 주문뿐이고
     * (위 블록), 결제만 되고 확정 전에 취소된 주문은 정산에 실린 적이 없다.
     * 그것을 빼면 가맹점이 **다른 주문으로 번 돈에서** 받은 적 없는 금액만큼
     * 깎인다. 그래서 확정된 적이 있는지(`confirmedAt`)로 바꿨다.
     *
     * 지금 상태 기계에서 구매확정은 종착이라 이 조건은 사실상 아무것도 고르지
     * 않는다. 지우지 않는 이유는 `deductibleFromSettlement` 의 주석에 있다 —
     * 확정 뒤 환불을 허용하는 날 규칙이 저절로 맞아야 한다.
     */
    prisma.orderItem.groupBy({
      by: ['merchantId'],
      where: {
        merchantId: { not: null },
        order: {
          status: { in: [...REFUND_STATUS] },
          confirmedAt: { not: null },
          canceledAt: { gte: period.start, lt: period.end },
        },
      },
      _sum: { subtotal: true },
    }),
    prisma.settlement.findMany({
      where: { periodStart: period.start, periodEnd: period.end },
      select: { merchantId: true, status: true },
    }),
  ]);

  const salesBy = new Map(sales.map((s) => [s.merchantId, s]));
  const refundBy = new Map(refunds.map((r) => [r.merchantId, r._sum.subtotal ?? 0]));
  const statusBy = new Map(existing.map((e) => [e.merchantId, e.status]));

  return merchants.map((m) => {
    const sale = salesBy.get(m.id);
    const amounts = calculateSettlement({
      gross: won(sale?._sum.subtotal ?? 0),
      commissionPercent: m.commissionPercent,
      refund: won(refundBy.get(m.id) ?? 0),
    });
    return {
      merchantId: m.id,
      merchantName: m.name,
      commissionPercent: m.commissionPercent,
      ...amounts,
      orderCount: sale?._count._all ?? 0,
      existingStatus: statusBy.get(m.id) ?? null,
    };
  });
}

export interface CloseResult {
  readonly yearMonth: string;
  readonly created: number;
  readonly updated: number;
  /** 이미 확정·지급되어 건드리지 않은 것 */
  readonly skipped: readonly string[];
}

/**
 * 기간을 확정한다.
 *
 * 여러 번 돌려도 결과가 같다. 확정·지급된 정산은 다시 계산하지 않고 건너뛴다 —
 * 배치는 재실행되기 마련이고, 재실행이 이미 지급된 금액을 바꾸면 안 된다.
 */
export async function closeSettlements(
  actor: Actor,
  yearMonth: string,
  now = new Date(),
): Promise<CloseResult> {
  assertPermission(actor, 'settlement:confirm');

  const period = settlementPeriod(yearMonth);
  if (!isClosedPeriod(period, now)) {
    throw new SettlementCloseError(
      'PERIOD_NOT_CLOSED', 409,
      '아직 끝나지 않은 기간은 확정할 수 없습니다.',
    );
  }

  // 가맹점 범위를 무시하고 전체를 본다. 확정은 플랫폼이 하는 일이다.
  const drafts = await previewSettlements(
    { ...actor, merchantId: null },
    yearMonth,
  );

  let created = 0;
  let updated = 0;
  const skipped: string[] = [];

  for (const d of drafts) {
    if (d.existingStatus !== null && !isRecalculable(d.existingStatus)) {
      skipped.push(d.merchantName);
      continue;
    }

    const data = {
      grossAmount: d.grossAmount,
      commissionAmount: d.commissionAmount,
      refundAmount: d.refundAmount,
      netAmount: d.netAmount,
      status: 'CONFIRMED' as const,
      confirmedAt: now,
    };

    await prisma.settlement.upsert({
      // 같은 가맹점의 같은 기간은 유니크 제약이 하나만 허용한다.
      // 배치가 두 번 돌아도 행이 늘지 않는다.
      where: {
        merchantId_periodStart_periodEnd: {
          merchantId: d.merchantId,
          periodStart: period.start,
          periodEnd: period.end,
        },
      },
      create: {
        merchantId: d.merchantId,
        periodStart: period.start,
        periodEnd: period.end,
        ...data,
      },
      update: data,
      select: { id: true },
    });

    if (d.existingStatus === null) created += 1;
    else updated += 1;
  }

  return { yearMonth, created, updated, skipped };
}

/** 지급 집행. 슈퍼관리자만 — 확정과 지급을 한 사람이 완결하지 못하게 나눠 뒀다. */
export async function paySettlement(actor: Actor, settlementId: string, now = new Date()) {
  assertPermission(actor, 'settlement:pay');

  const before = await prisma.settlement.findUnique({
    where: { id: settlementId },
    select: { id: true, status: true, netAmount: true, merchant: { select: { name: true } } },
  });
  if (!before) {
    throw new SettlementCloseError('NOT_FOUND', 404, '정산 내역을 찾을 수 없습니다.');
  }
  if (before.status === 'PAID') {
    throw new SettlementCloseError('ALREADY_PAID', 409, '이미 지급된 정산입니다.');
  }
  if (before.status !== 'CONFIRMED') {
    throw new SettlementCloseError('NOT_CONFIRMED', 409, '확정되지 않은 정산은 지급할 수 없습니다.');
  }
  if (before.netAmount < 0) {
    // 환불이 매출을 넘은 달이다. 돈을 보내는 게 아니라 받아야 하므로
    // 자동 집행 대상이 아니다.
    throw new SettlementCloseError('NEGATIVE_AMOUNT', 409, '지급액이 음수인 정산은 수동으로 처리해야 합니다.');
  }

  // 상태가 CONFIRMED 일 때만 바꾼다. 두 사람이 동시에 눌러도 한 번만 나간다.
  const result = await prisma.settlement.updateMany({
    where: { id: settlementId, status: 'CONFIRMED' },
    data: { status: 'PAID', paidAt: now },
  });
  if (result.count === 0) {
    throw new SettlementCloseError('ALREADY_PAID', 409, '이미 지급된 정산입니다.');
  }

  return {
    id: before.id,
    merchantName: before.merchant.name,
    netAmount: won(before.netAmount),
    status: 'PAID' as const,
  };
}
