import 'server-only';
import { prisma } from '@shop/db';
import { assertPermission, checkPointAdjust, pointAdjustEntry, type Actor, type PointAdjustDirection } from '@shop/core';
import type { AdjustPointsInput } from '@shop/contract';
import { AccessError } from './manage-access';

export interface PointAdjustResult {
  readonly userId: string;
  readonly direction: PointAdjustDirection;
  readonly amount: number;
  readonly note: string;
  /** 조정한 뒤 잔액 */
  readonly balance: number;
  /** 같은 열쇠로 이미 처리된 요청이었다 — 아무것도 새로 하지 않았다 */
  readonly replayed: boolean;
}

/**
 * 적립금 수동 지급·차감.
 *
 * **잔액과 원장을 한 트랜잭션에서 함께 바꾼다.** 잔액(User.pointBalance)은 원장 합계의 캐시다 — 하나만 바뀌면 대사
 * 배치가 그 계정을 매번 어긋났다고 잡는다.
 *
 * **차감은 조건부로 깎는다.** 읽은 잔액으로 판단한 뒤 그 사이 손님이 포인트를 쓰면 음수가 된다. 쓸 때 "지금 잔액이
 * 차감액 이상" 을 함께 걸고, 안 맞으면 되돌린다.
 *
 * **같은 열쇠는 한 번만 들어간다.** 원장의 adjustKey 가 유일해서, 두 번째 요청은 원장에 쓰는 순간 막히고 트랜잭션째
 * 되돌아간다(잔액도). 그러면 처음 것의 결과를 그대로 돌려준다 — 화면은 성공으로 읽고, 돈은 한 번 나갔다.
 */
export async function adjustPoints(
  actor: Actor,
  userId: string,
  input: AdjustPointsInput,
  now: Date = new Date(),
): Promise<PointAdjustResult> {
  assertPermission(actor, 'point:adjust');

  const replay = await replayOf(userId, input);
  if (replay) return replay;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { pointBalance: true, deletedAt: true },
  });
  if (!user) throw new AccessError('USER_NOT_FOUND', 404);

  const problem = checkPointAdjust({
    direction: input.direction,
    amount: input.amount,
    balance: user.pointBalance,
    closed: user.deletedAt !== null,
  });
  if (problem === 'USER_CLOSED') throw new AccessError('POINTS_USER_CLOSED', 409);
  if (problem === 'INSUFFICIENT_POINTS') throw new AccessError('INSUFFICIENT_POINTS', 409);

  const entry = pointAdjustEntry(input.direction, input.amount, now);

  try {
    const balance = await prisma.$transaction(async (tx) => {
      if (input.direction === 'DEDUCT') {
        const { count } = await tx.user.updateMany({
          where: { id: userId, pointBalance: { gte: input.amount } },
          data: { pointBalance: { decrement: input.amount } },
        });
        if (count === 0) throw new AccessError('INSUFFICIENT_POINTS', 409);
      } else {
        await tx.user.update({ where: { id: userId }, data: { pointBalance: { increment: input.amount } } });
      }

      await tx.pointTransaction.create({
        data: {
          userId,
          amount: entry.amount,
          expiresAt: entry.expiresAt,
          reason: 'ADMIN_ADJUST',
          // 손님 적립금 내역에 그대로 보인다
          note: input.note,
          adjustKey: input.key,
        },
      });

      const after = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { pointBalance: true } });
      return after.pointBalance;
    });

    return { userId, direction: input.direction, amount: input.amount, note: input.note, balance, replayed: false };
  } catch (error) {
    if (isAdjustKeyConflict(error)) {
      const again = await replayOf(userId, input);
      if (again) return again;
    }
    throw error;
  }
}

/** 이 열쇠로 이미 들어간 조정. 다른 회원에게 쓴 열쇠면 화면이 엉킨 것이라 막는다 */
async function replayOf(userId: string, input: AdjustPointsInput): Promise<PointAdjustResult | null> {
  const done = await prisma.pointTransaction.findUnique({
    where: { adjustKey: input.key },
    select: { userId: true, amount: true, note: true, user: { select: { pointBalance: true } } },
  });
  if (!done) return null;
  if (done.userId !== userId) throw new AccessError('CHANGED_MEANWHILE', 409);
  return {
    userId,
    direction: done.amount > 0 ? 'GRANT' : 'DEDUCT',
    amount: Math.abs(done.amount),
    note: done.note ?? input.note,
    balance: done.user.pointBalance,
    replayed: true,
  };
}

function isAdjustKeyConflict(error: unknown): boolean {
  const e = error as { code?: string; meta?: { target?: unknown } };
  if (e?.code !== 'P2002') return false;
  const target = e.meta?.target;
  // 배열에 String() 을 씌우면 "[object Object]" 가 되어 무엇과도 맞지 않는다(create-order 와 같은 함정)
  if (Array.isArray(target)) return target.includes('adjustKey');
  return typeof target === 'string' && target.includes('adjustKey');
}
