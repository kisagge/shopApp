import 'server-only';
import { prisma } from '@shop/db';
import { won, type Actor, type Won } from '@shop/core';
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
      merchant: { select: { name: true } },
    },
  });

  return rows.map((s) => ({
    id: s.id,
    merchantName: s.merchant.name,
    periodStart: s.periodStart,
    periodEnd: s.periodEnd,
    grossAmount: won(s.grossAmount),
    commissionAmount: won(s.commissionAmount),
    refundAmount: won(s.refundAmount),
    netAmount: won(s.netAmount),
    status: s.status,
  }));
}
