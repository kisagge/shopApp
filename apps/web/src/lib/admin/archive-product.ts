import 'server-only';
import { prisma } from '@shop/db';
import {
  archiverOf, canManageProduct, checkArchive, merchantScope,
  UNSHIPPED_LINE_STATUS,
  type Actor, type ArchiveAction, type ProductArchiver,
} from '@shop/core';
import { ProductError } from './manage-product';

export interface ArchiveState {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly deletedAt: Date | null;
  readonly archivedBy: ProductArchiver | null;
}

/**
 * 상품을 보관하거나 보관함에서 되돌린다.
 *
 * **보관한 상품도 찾는다.** 다른 운영 조회는 보관한 상품을 없는 것으로 보지만, 되돌리려면 찾아야 한다. 범위(자기
 * 브랜드인가)는 여기서도 where 절로 건다 — 남의 상품은 보관 여부와 상관없이 없는 것이다.
 *
 * 상태를 바꾸지 않는다. 판매중이던 것은 되돌리면 판매중이다 — 보관 전에 무엇이었는지 따로 적어 둘 필요가 없다.
 *
 * 바꿀 때는 **지금 칸이 기대한 값일 때만** 바꾼다. 두 사람이 동시에 누르면 한 사람만 바뀌고 다른 사람은 이미 된 일이라고
 * 듣는다 — 감사 로그에 같은 보관이 두 번 남지 않는다.
 */
export async function archiveProduct(
  actor: Actor,
  productId: string,
  action: ArchiveAction,
  now: Date = new Date(),
): Promise<{ before: ArchiveState; after: ArchiveState }> {
  const scope = merchantScope(actor);
  if (scope === undefined) throw new ProductError('PRODUCT_NOT_FOUND', 404);

  const before = await prisma.product.findFirst({
    where: { id: productId, ...(scope ? { brand: { merchantId: scope } } : {}) },
    select: {
      id: true, name: true, status: true, deletedAt: true, archivedBy: true,
      brand: { select: { merchantId: true } },
    },
  });
  if (!before) throw new ProductError('PRODUCT_NOT_FOUND', 404);
  if (!canManageProduct(actor, { merchantId: before.brand.merchantId })) {
    throw new ProductError('BRAND_NOT_ALLOWED', 403);
  }

  const problem = checkArchive(actor, action, before);
  if (problem) throw new ProductError(problem, problem === 'RESTORE_NOT_ALLOWED' ? 403 : 409);

  const archiving = action === 'ARCHIVE';
  const data = archiving
    ? { deletedAt: now, archivedBy: archiverOf(actor) }
    : { deletedAt: null, archivedBy: null };

  const { count } = await prisma.product.updateMany({
    where: { id: productId, deletedAt: archiving ? null : { not: null } },
    data,
  });
  if (count === 0) throw new ProductError(archiving ? 'ALREADY_ARCHIVED' : 'NOT_ARCHIVED', 409);

  const state = (p: typeof before): ArchiveState => ({
    id: p.id, name: p.name, status: p.status, deletedAt: p.deletedAt, archivedBy: p.archivedBy,
  });
  return { before: state(before), after: { ...state(before), ...data } };
}

/**
 * 아직 보내지 않은 주문 줄 수. 보관해도 이 줄들은 보내야 한다 — 누르기 전에 말한다.
 */
export async function countUnshippedLines(productId: string): Promise<number> {
  return await prisma.orderItem.count({
    where: {
      variant: { productId },
      canceledAt: null,
      status: { in: [...UNSHIPPED_LINE_STATUS] },
    },
  });
}
