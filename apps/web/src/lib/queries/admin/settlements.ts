import 'server-only';
import { prisma } from '@shop/db';
import { hasSettlementAccount, maskAccount, won, type Actor, type Won } from '@shop/core';
import { assertAdminQuery, scopeOf } from './scope';

// ── 정산 ──────────────────────────────────────────────────────

export interface SettlementRow {
  readonly id: string;
  readonly merchantName: string;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly grossAmount: Won;
  readonly commissionAmount: Won;
  readonly refundAmount: Won;
  readonly netAmount: Won;
  readonly status: string;
  /**
   * 보낼 곳. **가려서 내보낸다** — 목록은 "그 계좌가 맞는지" 를 가리는 자리이고, 전체 번호가 필요한 자리가 아니다.
   * 계좌가 없으면 null 이고, 그때는 지급 자체가 막힌다.
   */
  readonly account: { readonly bank: string; readonly tail: string; readonly holder: string } | null;
}

export async function getSettlements(actor: Actor): Promise<SettlementRow[]> {
  assertAdminQuery(actor, 'settlement:read');
  const scope = scopeOf(actor);

  const rows = await prisma.settlement.findMany({
    where: scope ? { merchantId: scope } : {},
    orderBy: { periodEnd: 'desc' },
    take: 24,
    select: {
      id: true, periodStart: true, periodEnd: true,
      grossAmount: true, commissionAmount: true, refundAmount: true, netAmount: true,
      status: true,
      merchant: {
        select: {
          name: true,
          settlementBank: true, settlementAccount: true, settlementHolder: true,
        },
      },
    },
  });

  return rows.map((s) => ({
    id: s.id,
    merchantName: s.merchant.name,
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
    netAmount: won(s.netAmount),
    status: s.status,
  }));
}
