import type { Actor, UserRole } from '@shop/core';
import { USER_ROLE, actorForMerchantStatus } from '@shop/core';
import { prisma } from '@shop/db';
import { auth } from './index';

export interface SessionUser extends Actor {
  readonly email: string;
  readonly name: string;
}

/**
 * 알 수 없는 값은 CUSTOMER 로 떨어뜨린다.
 * DB 가 손상되거나 마이그레이션이 어긋났을 때 권한이 올라가는 쪽으로
 * 기울면 안 된다 — 항상 낮은 쪽으로 닫는다.
 */
function toRole(value: unknown): UserRole {
  return typeof value === 'string' && (USER_ROLE as readonly string[]).includes(value)
    ? (value as UserRole)
    : 'CUSTOMER';
}

/** 세션에서 우리가 쓰는 값만 뽑아 온다. 없으면 null. */
export async function getSessionUser(headers: Headers): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers });
  if (!session) return null;

  const u = session.user as {
    id: string; email: string; name: string;
    role?: unknown; merchantId?: unknown;
  };

  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: toRole(u.role),
    merchantId: typeof u.merchantId === 'string' ? u.merchantId : null,
  };
}

/**
 * 권한 판정용. packages/core 의 authz 에 그대로 넘긴다.
 *
 * **가맹점 계정은 가맹점 상태를 DB 에서 본다.** 정지된 가맹점도 콘솔을 그대로 썼다 — 역할은 세션에 실린 채
 * 그대로였기 때문이다. 판정은 core(actorForMerchantStatus)가 하고, 여기서는 지금 상태를 읽기만 한다. 세션 캐시(5분)를
 * 기다리지 않고 정지한 순간부터 막힌다. 가맹점 계정일 때만 묻는다 — 손님·운영진에게 왕복을 하나 더 얹지 않는다.
 *
 * 모든 콘솔 화면(requireAdmin)과 창구(getActor → assertPermission)가 이 한 곳을 지난다.
 */
export async function getActor(headers: Headers): Promise<Actor | null> {
  const user = await getSessionUser(headers);
  if (!user) return null;
  const actor: Actor = { id: user.id, role: user.role, merchantId: user.merchantId };
  if (actor.role !== 'MERCHANT' || actor.merchantId === null) return actorForMerchantStatus(actor, null);

  const merchant = await prisma.merchant.findUnique({
    where: { id: actor.merchantId },
    select: { status: true },
  });
  return actorForMerchantStatus(actor, merchant?.status ?? null);
}

export { toRole as normalizeRole };
