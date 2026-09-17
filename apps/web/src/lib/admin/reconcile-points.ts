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

export interface PointFix {
  readonly userId: string;
  readonly from: number;
  readonly to: number;
}

export interface ReconcileResult {
  /** 검사한 회원 수 — 전체다 */
  readonly checked: number;
  /** 어긋난 회원 전체 수. 목록은 차이가 큰 순으로 MISMATCH_LIST_MAX 까지만 싣는다 */
  readonly mismatchTotal: number;
  readonly mismatches: readonly PointMismatch[];
  /** fix 로 실제로 고친 수 */
  readonly fixed: number;
  /**
   * 실제로 고친 회원과 **고칠 때 본** 잔액·원장. 목록의 값은 읽은 시점의 것이라 고칠 때와 다를 수 있고,
   * 그사이 맞춰져 건너뛴 회원도 있다 — 감사 로그에는 실제로 쓴 것만 남긴다.
   */
  readonly fixes: readonly PointFix[];
  /** 저장값이 원장보다 큰 건의 합계 — 손실 위험 금액(전체) */
  readonly overCredited: number;
}

/** 화면과 한 번의 고치기가 다루는 줄 수. 넘치면 다음 대사(매일 도는 배치)가 이어서 고친다 */
export const MISMATCH_LIST_MAX = 1000;

interface MismatchRow {
  id: string;
  name: string;
  email: string;
  stored: number;
  ledger: bigint;
  entries: bigint;
  total: bigint;
  over: bigint;
}

export async function reconcilePoints(
  actor: Actor,
  options: { fix?: boolean } = {},
): Promise<ReconcileResult> {
  // 읽기만 해도 회원 전체의 잔액을 보는 일이라 user:read 로 막는다.
  assertPermission(actor, options.fix ? 'user:write' : 'user:read');

  /*
   * **잔액과 원장 합계를 한 문장에서 읽는다.** 예전에는 회원(최근 가입 500명만)과 원장 합계를 따로
   * 읽었다. 그 사이에 주문이 끝나면 한쪽은 주문 전, 한쪽은 주문 뒤를 보아 멀쩡한 회원이 어긋나 보였고,
   * 원장을 먼저 읽은 경우에는 "잔액이 그대로면 고친다" 조건도 통과해 **새 잔액을 옛 합계로 덮었다.**
   * 한 문장은 한 시점만 본다. 오래된 회원도 빠짐없이 본다.
   */
  const [checked, rows] = await Promise.all([
    prisma.user.count(),
    prisma.$queryRaw<MismatchRow[]>`
      SELECT u.id, u.name, u.email, u."pointBalance" AS stored,
             COALESCE(l.sum, 0) AS ledger, COALESCE(l.cnt, 0) AS entries,
             COUNT(*) OVER () AS total,
             SUM(GREATEST(u."pointBalance" - COALESCE(l.sum, 0), 0)) OVER ()::bigint AS over
      FROM users u
      LEFT JOIN (
        SELECT "userId", SUM(amount)::bigint AS sum, COUNT(*) AS cnt
        FROM point_transactions GROUP BY "userId"
      ) l ON l."userId" = u.id
      WHERE u."pointBalance" <> COALESCE(l.sum, 0)
      ORDER BY ABS(u."pointBalance" - COALESCE(l.sum, 0)) DESC, u.id
      LIMIT ${MISMATCH_LIST_MAX}
    `,
  ]);

  // 원장에 줄이 하나도 없으면 합계는 0 이다. 잔액이 0 이 아니면 그것도
  // 불일치다 — 원장 없이 생긴 포인트가 가장 위험하다.
  const mismatches: PointMismatch[] = rows.map((r) => ({
    userId: r.id,
    name: r.name,
    email: r.email,
    storedBalance: r.stored,
    ledgerBalance: Number(r.ledger),
    difference: r.stored - Number(r.ledger),
    entryCount: Number(r.entries),
  }));

  const fixes: PointFix[] = [];
  if (options.fix) {
    for (const m of mismatches) {
      const fix = await fixOne(m.userId);
      if (fix) fixes.push(fix);
    }
  }

  return {
    checked,
    mismatchTotal: Number(rows[0]?.total ?? 0),
    mismatches,
    fixed: fixes.length,
    fixes,
    overCredited: Number(rows[0]?.over ?? 0),
  };
}

/**
 * 한 회원을 원장에 맞춘다.
 *
 * **잠근 뒤 원장을 다시 센다.** 포인트를 쓰고 주는 길은 모두 원장 줄과 잔액을 한 트랜잭션에서 바꾸므로,
 * 회원 행을 잠그면 진행 중인 쪽이 끝날 때까지 기다리고, 그다음 센 합계는 잔액과 같은 시점이다.
 * 읽어 둔 합계로 덮지 않는다 — 그사이 포인트를 쓴 회원의 잔액이 옛 값으로 돌아간다.
 */
async function fixOne(userId: string): Promise<PointFix | null> {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ pointBalance: number }[]>`
      SELECT "pointBalance" FROM users WHERE id = ${userId} FOR UPDATE
    `;
    if (locked.length === 0) return null; // 그사이 탈퇴로 지워졌다
    const { _sum } = await tx.pointTransaction.aggregate({ where: { userId }, _sum: { amount: true } });
    const ledger = _sum.amount ?? 0;
    const from = locked[0]!.pointBalance;
    if (from === ledger) return null; // 그사이 맞춰졌다
    await tx.user.update({ where: { id: userId }, data: { pointBalance: ledger } });
    return { userId, from, to: ledger };
  });
}
