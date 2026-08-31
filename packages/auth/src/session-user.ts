import type { Actor, UserRole } from '@shop/core';
import { USER_ROLE } from '@shop/core';
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

/** 권한 판정용. packages/core 의 authz 에 그대로 넘긴다. */
export async function getActor(headers: Headers): Promise<Actor | null> {
  const user = await getSessionUser(headers);
  if (!user) return null;
  return { id: user.id, role: user.role, merchantId: user.merchantId };
}

export { toRole as normalizeRole };
