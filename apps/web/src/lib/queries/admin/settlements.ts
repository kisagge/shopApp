import 'server-only';
import { prisma } from '@shop/db';
import { hasSettlementAccount, maskAccount, offsetOf, won, type Actor, type Won } from '@shop/core';
import { assertAdminQuery, scopeOf } from './scope';
import { clampToLastPage } from '../paged';

// ── 정산 ──────────────────────────────────────────────────────

export interface SettlementRow {
  readonly id: string;
  readonly merchantName: string;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly grossAmount: Won;
  readonly commissionAmount: Won;
  readonly refundAmount: Won;
  /** 앞선 달에서 넘어와 뺀 금액(0 이하) */
  readonly carriedAmount: Won;
  readonly netAmount: Won;
  readonly status: string;
  /** 이 달의 음수 지급액을 떠안은 달의 시작. 넘기지 않았으면 null */
  readonly carriedIntoStart: Date | null;
  /** 그때의 수수료율. 지금 요율이 아니다 — 확정은 숫자와 함께 요율도 얼린다 */
  readonly commissionPercent: number;
  /**
   * 보낼 곳. **가려서 내보낸다** — 목록은 "그 계좌가 맞는지" 를 가리는 자리이고, 전체 번호가 필요한 자리가 아니다.
   * 계좌가 없으면 null 이고, 그때는 지급 자체가 막힌다.
   */
  readonly account: { readonly bank: string; readonly tail: string; readonly holder: string } | null;
}

/** 정산 내역 한 쪽의 줄 수 */
export const SETTLEMENT_PAGE_SIZE = 30;

/**
 * 확정된 정산 내역.
 *
 * **24줄에서 끊겼다.** 가맹점 전체를 합쳐 24줄이라, 가맹점이 셋이면 여덟 달 앞의 정산은 볼 길이 없었다 — 지난
 * 지급을 맞춰 보는 자리인데. 다른 운영 목록과 같이 쪽 번호로 넘긴다(page-nav).
 */
export async function getSettlements(actor: Actor, page = 1): Promise<{ rows: SettlementRow[]; total: number }> {
  assertAdminQuery(actor, 'settlement:read');
  const scope = scopeOf(actor);
  const where = scope ? { merchantId: scope } : {};

  const read = (at: number) =>
    prisma.settlement.findMany({
      where,
      // 같은 기간의 가맹점들이 쪽마다 흔들리지 않게 가맹점 id 로 마저 가른다
      orderBy: [{ periodEnd: 'desc' }, { merchantId: 'asc' }],
      skip: offsetOf(at, SETTLEMENT_PAGE_SIZE),
      take: SETTLEMENT_PAGE_SIZE,
      select: {
        id: true, periodStart: true, periodEnd: true,
        grossAmount: true, commissionAmount: true, refundAmount: true, carriedAmount: true, netAmount: true,
        status: true, commissionPercent: true,
        carriedInto: { select: { periodStart: true } },
        merchant: {
          select: {
            name: true,
            settlementBank: true, settlementAccount: true, settlementHolder: true,
          },
        },
      },
    });

  const [first, total] = await Promise.all([read(page), prisma.settlement.count({ where })]);
  const rows = await clampToLastPage(first, { page, pageSize: SETTLEMENT_PAGE_SIZE, total }, read);

  return { total, rows: rows.map((s) => ({
    id: s.id,
    merchantName: s.merchant.name,
    commissionPercent: s.commissionPercent,
    account: hasSettlementAccount(s.merchant)
      ? {
          bank: s.merchant.settlementBank!,
          tail: maskAccount(s.merchant.settlementAccount)!,
          holder: s.merchant.settlementHolder!,
        }
      : null,
    periodStart: s.periodStart,
    periodEnd: s.periodEnd,
    grossAmount: won(s.grossAmount),
    commissionAmount: won(s.commissionAmount),
    refundAmount: won(s.refundAmount),
    carriedAmount: won(s.carriedAmount),
    netAmount: won(s.netAmount),
    status: s.status,
    carriedIntoStart: s.carriedInto?.periodStart ?? null,
  })) };
}
