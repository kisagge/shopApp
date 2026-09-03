import 'server-only';
import { prisma } from '@shop/db';

/**
 * 이 사용자가 알림을 걸어 둔 옵션 id 들.
 *
 * 옵션마다 따로 물으면 옵션 수만큼 쿼리가 나간다. 한 번에 받아 두고
 * 화면은 그 집합만 본다 — 찜 목록과 같은 이유다.
 *
 * 이미 알림을 받은 건(notifiedAt 이 있는 것)은 빼고 준다. 그건 기다리는
 * 상태가 아니라 끝난 건이다.
 */
export async function getSubscribedVariantIds(
  userId: string,
  variantIds: readonly string[],
): Promise<Set<string>> {
  if (variantIds.length === 0) return new Set();
  const rows = await prisma.restockNotification.findMany({
    where: { userId, variantId: { in: [...variantIds] }, notifiedAt: null },
    select: { variantId: true },
  });
  return new Set(rows.map((r) => r.variantId));
}
