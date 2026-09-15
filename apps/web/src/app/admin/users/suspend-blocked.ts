import { canSuspendUser, type UserRole } from '@shop/core';

/** 정지 폼을 못 여는 이유. 서버도 같은 판정(canSuspendUser)으로 막는다 — 누를 수 있게 두면 왜 안 되는지 모른다 */
export function suspendBlocked(
  actor: Parameters<typeof canSuspendUser>[0],
  u: { id: string; role: string; closedAt: Date | null },
): string | undefined {
  if (u.closedAt) return '탈퇴한 계정';
  switch (canSuspendUser(actor, { id: u.id, role: u.role as UserRole })) {
    case 'SELF': return '본인 계정';
    case 'STAFF': return '운영진 계정';
    case 'FORBIDDEN': return '권한 없음';
    default: return undefined;
  }
}
