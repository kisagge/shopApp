import 'server-only';
import { prisma } from '@shop/db';
import { assertPermission, type Actor } from '@shop/core';

/**
 * 포인트 잔액 대사.
 *
 * **원장이 진실이고 User.pointBalance 는 캐시다.** 원장은 덧붙이기만 하는
 * 표라 되짚어 검증할 수 있지만, 잔액은 갱신되는 값이라 한 번 어긋나면 스스로
 * 알아채지 못한다. 주문 실패나 배치 중단으로 원장만 남고 잔액이 안 바뀌는
 * 순간이 실제로 생기므로, 정기적으로 둘을 맞춰 봐야 한다.
 *
 * 고치는 방향은 **원장 → 잔액** 한쪽뿐이다. 반대로 원장을 잔액에 맞추면
 * 돈이 어디서 생겼는지 설명할 수 없는 줄을 만들게 된다.
 */

export interface PointMismatch {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  /** 지금 저장된 잔액 */
  readonly storedBalance: number;
  /** 원장 합계 — 이쪽이 맞다 */
  readonly ledgerBalance: number;
  /** 저장값 − 원장. 양수면 없는 포인트를 들고 있는 것이다. */
  readonly difference: number;
  readonly entryCount: number;
}

export interface ReconcileResult {
  readonly checked: number;
  readonly mismatches: readonly PointMismatch[];
  /** fix 로 실제로 고친 수 */
  readonly fixed: number;
  /** 저장값이 원장보다 큰 건의 합계 — 손실 위험 금액 */
  readonly overCredited: number;
}

export async function reconcilePoints(
  actor: Actor,
  options: { fix?: boolean; limit?: number } = {},
): Promise<ReconcileResult> {
  // 읽기만 해도 회원 전체의 잔액을 보는 일이라 user:read 로 막는다.
  assertPermission(actor, options.fix ? 'user:write' : 'user:read');

  const limit = Math.min(options.limit ?? 500, 2000);

  const [users, ledger] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, name: true, email: true, pointBalance: true },
    }),
    prisma.pointTransaction.groupBy({
      by: ['userId'],
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);

  const ledgerBy = new Map(ledger.map((l) => [l.userId, l]));

  const mismatches: PointMismatch[] = [];
  for (const u of users) {
    const entry = ledgerBy.get(u.id);
    // 원장에 줄이 하나도 없으면 합계는 0 이다. 잔액이 0 이 아니면 그것도
    // 불일치다 — 원장 없이 생긴 포인트가 가장 위험하다.
    const ledgerBalance = entry?._sum.amount ?? 0;
    if (ledgerBalance === u.pointBalance) continue;

    mismatches.push({
      userId: u.id,
      name: u.name,
      email: u.email,
      storedBalance: u.pointBalance,
      ledgerBalance,
      difference: u.pointBalance - ledgerBalance,
      entryCount: entry?._count._all ?? 0,
    });
  }

  let fixed = 0;
  if (options.fix && mismatches.length > 0) {
    // 한 건씩 조건부로 고친다. 대사 중에 포인트를 쓴 사용자의 잔액을
    // 낡은 값으로 덮어쓰면 대사가 오히려 어긋나게 만든다.
    for (const m of mismatches) {
      const result = await prisma.user.updateMany({
        where: { id: m.userId, pointBalance: m.storedBalance },
        data: { pointBalance: m.ledgerBalance },
      });
      fixed += result.count;
    }
  }

  return {
    checked: users.length,
    mismatches,
    fixed,
    overCredited: mismatches
      .filter((m) => m.difference > 0)
      .reduce((sum, m) => sum + m.difference, 0),
  };
}
