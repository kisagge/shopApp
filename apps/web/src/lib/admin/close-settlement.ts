import 'server-only';
import { prisma } from '@shop/db';
import {
  assertPermission, calculateSettlement, settlementPeriod, isClosedPeriod, isRecalculable,
  hasSettlementAccount, settlementWorthTelling, won,
  type Actor, type Won, type SettlementStatus,
} from '@shop/core';
import { notifySettlementClosed, notifySettlementPaid } from '~/lib/notifications/settlement';

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

/**
 * 정산 **판매**로 싣는 줄.
 *
 * 구매확정 시점 기준이다. 결제 시점으로 잡으면 반품 가능 기간이 지나지 않은 돈까지 가맹점에 넘어간다.
 *
 * **지금 주문 상태를 보지 않는다 — 확정된 적이 있는지(확정 시각)만 본다.** 예전에는 "구매확정 상태인
 * 주문" 이었다. 그러면 확정 뒤 반품·환불된 주문이 **그 달 판매에서 소리 없이 빠지고**, 아래 차감에는
 * 잡힌다 — 같은 달이면 가맹점이 두 번 깎이고, 다른 달이면 이미 지급한 달의 판매가 바뀐다. 반품을
 * 접수만 해도(반품접수 상태) 빠졌다가 반려하면 되돌아왔다. 판 것은 판 달에 싣고, 돌아간 것은 돌아간
 * 달에 뺀다.
 *
 * 돈이 돌아간 줄 중 **확정 전에 돌아간 것**(출고 전 일부 취소)은 판 것이 아니므로 뺀다.
 *
 * 정산 초안과 정산 내역 내려받기가 이 조건 하나를 쓴다 — 따로 적으면 파일의 합이 초안과 어긋난다.
 */
export function settlementSaleWhere(period: { start: Date; end: Date }, merchantId?: string) {
  return {
    merchantId: merchantId ?? { not: null },
    OR: [{ canceledAt: null }, { refundedAfterConfirm: true }],
    order: { confirmedAt: { gte: period.start, lt: period.end } },
  };
}

/**
 * 정산에서 **빼는** 줄 — 확정 뒤에 돈이 돌아간 줄만, 돌아간 달에.
 *
 * 확정 전에 돌아간 줄은 판매에 실린 적이 없어 빼면 가맹점이 받은 적 없는 돈을 토해낸다. 주문 상태로
 * 가르면 한 줄만 반품한 주문(구매확정인 채로 남는다)이 빠진다. 줄이 스스로 기억한다.
 */
export function settlementDeductionWhere(period: { start: Date; end: Date }, merchantId?: string) {
  return {
    merchantId: merchantId ?? { not: null },
    canceledAt: { gte: period.start, lt: period.end },
    refundedAfterConfirm: true,
  };
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
    prisma.orderItem.groupBy({
      by: ['merchantId'],
      where: settlementSaleWhere(period),
      _sum: { subtotal: true },
      _count: { _all: true },
    }),
    prisma.orderItem.groupBy({
      by: ['merchantId'],
      where: settlementDeductionWhere(period),
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
  /*
   * **처음 확정될 때만 알린다.** 이 함수는 여러 번 돌려도 결과가 같게 만들어 뒀고,
   * 배치는 실제로 재실행된다 — 재실행마다 알리면 같은 달 정산이 알림함에 여러 번
   * 쌓여서, 두 번째부터는 아무도 읽지 않는다. 다시 계산해 금액이 바뀐 경우는
   * 알리지 않고 두는 편이 낫다고 봤다: 그 숫자는 정산 화면이 늘 옳게 보여 준다.
   */
  const told: { merchantId: string; netAmount: number }[] = [];

  for (const d of drafts) {
    if (d.existingStatus !== null && !isRecalculable(d.existingStatus)) {
      skipped.push(d.merchantName);
      continue;
    }

    const data = {
      grossAmount: d.grossAmount,
      commissionAmount: d.commissionAmount,
      // 금액과 함께 **그때의 요율**도 얼린다 — 나중에 요율이 바뀌어도 이 행이 무엇으로 계산됐는지 남는다
      commissionPercent: d.commissionPercent,
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

    if (d.existingStatus === null) {
      created += 1;
      // 판 것도 돌아간 것도 없는 달은 장부에만 남긴다 — 0원 확정을 매달 보내면 알림함이 죽는다
      if (settlementWorthTelling(d)) told.push({ merchantId: d.merchantId, netAmount: d.netAmount });
    } else {
      updated += 1;
    }
  }

  await notifySettlementClosed(yearMonth, told);

  return { yearMonth, created, updated, skipped };
}

/** 지급 집행. 슈퍼관리자만 — 확정과 지급을 한 사람이 완결하지 못하게 나눠 뒀다. */
export async function paySettlement(actor: Actor, settlementId: string, now = new Date()) {
  assertPermission(actor, 'settlement:pay');

  const before = await prisma.settlement.findUnique({
    where: { id: settlementId },
    select: {
      id: true, status: true, netAmount: true,
      // 알림이 "어느 달 정산인지" 를 말해야 한다. 행은 기간의 시작 시각만 들고 다닌다
      merchantId: true, periodStart: true,
      merchant: {
        select: {
          name: true,
          settlementBank: true, settlementAccount: true, settlementHolder: true,
        },
      },
    },
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
  /*
   * **계좌 없이 "지급됨" 을 만들지 않는다.**
   *
   * 스키마에는 계좌 칸이 처음부터 있었는데 읽는 곳이 없어서, 한 번도 적지 않은 가맹점의 정산도 눌러 지급이 됐다 —
   * 돈이 어디로 갔다는 말인지 아무도 답할 수 없는 기록이다. 반품지가 없으면 반품을 승인할 수 없게 한 것과 같은 자리다.
   */
  if (!hasSettlementAccount(before.merchant)) {
    throw new SettlementCloseError(
      'NO_ACCOUNT', 409,
      `${before.merchant.name} 의 정산 계좌가 없습니다. 가맹점 정보에서 먼저 등록해야 지급할 수 있습니다.`,
    );
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

  /*
   * 상태를 바꾼 뒤에 알린다 — 위 updateMany 가 한 번만 통과하므로 두 사람이 동시에
   * 눌러도 알림은 한 번 나간다. 먼저 알리면 진 쪽도 알림을 남기게 된다.
   */
  await notifySettlementPaid({
    merchantId: before.merchantId,
    periodStart: before.periodStart,
    netAmount: before.netAmount,
  });

  return {
    id: before.id,
    merchantName: before.merchant.name,
    netAmount: won(before.netAmount),
    status: 'PAID' as const,
  };
}
