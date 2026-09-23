import 'server-only';
import { prisma } from '@shop/db';
import { expirableAmount } from '@shop/core';

/**
 * 기한이 지난 포인트를 소멸시킨다.
 *
 * 적립할 때 유효기간을 찍어 두었지만 **그 값을 읽는 코드가 없어서** 만료된
 * 포인트가 잔액에 그대로 남아 계속 쓸 수 있었다.
 *
 * **소멸도 원장에 적는다.** 잔액만 깎으면 원장 합계와 어긋나고, 그 뒤로
 * 대사 배치가 매번 이 계정을 어긋난 것으로 잡는다. 탈퇴할 때 남은 포인트를
 * 처리하는 방식과 같다.
 *
 * 여러 번 돌아도 안전하다 — 적어 둔 소멸 기록이 다음 계산에서 차감으로
 * 들어가므로 같은 포인트가 두 번 사라지지 않는다.
 */

export interface ExpiredUser {
  readonly userId: string;
  readonly name: string;
  readonly amount: number;
}

export interface ExpiryResult {
  readonly checked: number;
  readonly expired: readonly ExpiredUser[];
  readonly total: number;
}

/**
 * 볼 필요가 있는 사람만 추린다.
 *
 * 기한이 지난 적립이 하나도 없으면 계산할 것이 없다. 전체 회원을 훑으면
 * 회원이 늘수록 배치가 그대로 무거워진다.
 */
async function candidateUserIds(now: Date): Promise<string[]> {
  const rows = await prisma.pointTransaction.findMany({
    where: { amount: { gt: 0 }, expiresAt: { not: null, lte: now } },
    select: { userId: true },
    distinct: ['userId'],
  });
  return rows.map((r) => r.userId);
}

export async function expirePoints(now = new Date()): Promise<ExpiryResult> {
  const userIds = await candidateUserIds(now);
  const losses: { userId: string; amount: number }[] = [];
  let total = 0;

  for (const userId of userIds) {
    /*
     * 사람마다 원장 전체를 읽는다. 짝을 지으려면 적립과 사용을 모두 봐야
     * 하고, 한 사람의 원장은 유한하다. 대상자만 추려 왔으므로 전체 회원을
     * 훑는 것과는 다르다.
     */
    const entries = await prisma.pointTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { amount: true, createdAt: true, expiresAt: true },
    });

    const amount = expirableAmount(entries, now);
    if (amount <= 0) continue;

    /*
     * 잔액을 조건부로 깎는다. 배치가 도는 동안 그 사람이 포인트를 썼다면
     * 낡은 값을 덮어쓰게 되므로, 지금 잔액이 소멸액 이상일 때만 손댄다.
     * 못 깎은 건은 다음 실행에서 다시 잡힌다.
     */
    const updated = await prisma.$transaction(async (tx) => {
      const { count } = await tx.user.updateMany({
        where: { id: userId, pointBalance: { gte: amount } },
        data: { pointBalance: { decrement: amount } },
      });
      if (count === 0) return false;

      await tx.pointTransaction.create({
        data: { userId, amount: -amount, reason: 'EXPIRE', note: '유효기간 만료' },
      });
      return true;
    });

    if (!updated) continue;

    losses.push({ userId, amount });
    total += amount;
  }

  return { checked: userIds.length, expired: await withNames(losses), total };
}

/**
 * 누가 잃었는지 이름을 붙인다.
 *
 * **한 번에 읽는다.** 예전에는 사람마다 이름 한 칸을 따로 물었다 — 소멸된 사람이
 * 백 명이면 왕복이 백 번 더 나갔고, DB 가 바다 건너에 있으니 그것만으로 십여 초다.
 * 목록 조회가 `loadActors` 로 진작 고친 것과 같은 모양이다.
 *
 * 이름은 보고용이라 여기서 실패해도 소멸 자체는 이미 끝나 있다.
 */
async function withNames(
  losses: readonly { userId: string; amount: number }[],
): Promise<ExpiredUser[]> {
  if (losses.length === 0) return [];

  const rows = await prisma.user.findMany({
    where: { id: { in: losses.map((l) => l.userId) } },
    select: { id: true, name: true },
  });
  const names = new Map(rows.map((r) => [r.id, r.name]));

  // 이 사이에 탈퇴했으면 행이 없다. 소멸은 이미 일어났으므로 줄은 남긴다.
  return losses.map((l) => ({ ...l, name: names.get(l.userId) ?? '(알 수 없음)' }));
}
