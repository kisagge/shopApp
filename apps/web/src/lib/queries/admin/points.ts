import 'server-only';
import { prisma } from '@shop/db';
import { assertPermission, type Actor, type PointReason } from '@shop/core';

export interface AdminPointAccount {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly balance: number;
  readonly closedAt: Date | null;
  readonly ledger: readonly {
    readonly id: string;
    readonly amount: number;
    readonly reason: PointReason;
    readonly note: string | null;
    readonly createdAt: Date;
    readonly expiresAt: Date | null;
  }[];
}

/**
 * 한 회원의 적립금 잔액과 최근 원장.
 *
 * 조정하기 전에 **지금까지 무엇이 오갔는지** 봐야 한다 — 이미 보상을 받았는지, 반품 회수로 빠졌는지 모르고 주면
 * 두 번 준다. 조회만 하는 사람(user:read)도 볼 수 있고, 지급·차감은 point:adjust 가 있을 때만 화면에 뜬다.
 */
export async function getAdminPointAccount(
  actor: Actor,
  userId: string,
  take = 30,
): Promise<AdminPointAccount | null> {
  assertPermission(actor, 'user:read');
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, name: true, email: true, pointBalance: true, deletedAt: true,
      pointHistory: {
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
        select: { id: true, amount: true, reason: true, note: true, createdAt: true, expiresAt: true },
      },
    },
  });
  if (!user) return null;
  return {
    id: user.id, name: user.name, email: user.email, balance: user.pointBalance, closedAt: user.deletedAt,
    ledger: user.pointHistory,
  };
}
