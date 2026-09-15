import { merchantScope, type Actor } from './authz';
import type { OrderStatus } from './order-state';

/**
 * 상품 보관.
 *
 * **지우지 않고 보관한다.** 주문 줄이 옵션을 가리키고 있어 행을 지울 수 없고, 지울 수 있더라도 지난 주문·정산·리뷰가
 * 가리킬 것을 잃는다. 보관한 상품은 매대·검색·장바구니에서 빠지고, 보관함에서 되돌리면 보관하기 전 상태로 돌아온다
 * — 판매중이던 것은 다시 판매중이다(검수는 최초 게시 한 번이다).
 *
 * 보관한 쪽을 적는 이유: 운영진이 규정 위반으로 내린 상품을 가맹점이 그대로 되살리면 내린 뜻이 없다.
 */

export const PRODUCT_ARCHIVER = ['MERCHANT', 'STAFF'] as const;
export type ProductArchiver = (typeof PRODUCT_ARCHIVER)[number];

export const ARCHIVE_ACTION = ['ARCHIVE', 'RESTORE'] as const;
export type ArchiveAction = (typeof ARCHIVE_ACTION)[number];

export type ArchiveProblem = 'ALREADY_ARCHIVED' | 'NOT_ARCHIVED' | 'RESTORE_NOT_ALLOWED';

/** 범위 제한이 없는 쪽(운영진)이 STAFF 다 — 가맹점 범위 판정과 같은 것을 본다 */
export const archiverOf = (actor: Actor): ProductArchiver => (merchantScope(actor) === null ? 'STAFF' : 'MERCHANT');

/**
 * 보관·되돌리기를 할 수 있는가. 권한(자기 브랜드인가)은 canManageProduct 가 먼저 본다 — 여기는 상태만 본다.
 * 할 수 있으면 null.
 */
export function checkArchive(
  actor: Actor,
  action: ArchiveAction,
  product: { readonly deletedAt: Date | null; readonly archivedBy: ProductArchiver | null },
): ArchiveProblem | null {
  if (action === 'ARCHIVE') return product.deletedAt === null ? null : 'ALREADY_ARCHIVED';
  if (product.deletedAt === null) return 'NOT_ARCHIVED';
  // 보관한 쪽을 모르는(예전에 지운) 상품도 운영진만 — 누가 왜 내렸는지 모르면 닫는 편이 안전하다
  if (archiverOf(actor) !== 'STAFF' && product.archivedBy !== 'MERCHANT') return 'RESTORE_NOT_ALLOWED';
  return null;
}

/**
 * 아직 보내지 않은 주문 줄의 상태. 보관해도 이 줄들은 **보내야 한다** — 보관은 새로 파는 것을 멈출 뿐이다.
 * 누르기 전에 몇 건 남았는지 말한다.
 */
export const UNSHIPPED_LINE_STATUS = ['PAID', 'PREPARING'] as const satisfies readonly OrderStatus[];
