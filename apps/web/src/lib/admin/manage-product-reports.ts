import 'server-only';
import { prisma } from '@shop/db';
import {
  assertPermission, PRODUCT_REPORT_ERROR,
  type Actor, type ProductReportErrorCode, type ProductReportResolution,
} from '@shop/core';
import { archiveProduct } from './archive-product';

export class ProductReportResolveError extends Error {
  constructor(readonly code: ProductReportErrorCode, readonly status = 409) {
    super(PRODUCT_REPORT_ERROR[code]);
    this.name = 'ProductReportResolveError';
  }
}

export interface ResolveResult {
  readonly productId: string;
  readonly resolution: ProductReportResolution;
  /** 닫은 신고 수 */
  readonly resolved: number;
  readonly archived: boolean;
}

/**
 * 상품 신고를 닫는다.
 *
 * **상품을 내리는 것과 신고를 닫는 것은 다른 일이고, 순서가 요점이다.** 먼저 내리고 나서
 * 닫는다 — 닫기가 먼저면 내리기가 실패했을 때 **대기줄에서는 사라졌는데 상품은 그대로**가
 * 된다. 그 상품은 아무도 다시 보지 않는다. 반대 순서면 최악이 "내려갔는데 대기줄에 한 줄
 * 남았다" 이고, 그건 다음에 처리하면 된다.
 *
 * 내리는 것은 기존 보관 창구를 그대로 쓴다(`archiveProduct`) — 보관 경로가 둘이면 한쪽만
 * 감사 로그를 남기거나 한쪽만 상태를 검사하게 된다.
 *
 * **문제없음으로 닫는 것도 기록이다.** 지운 것과 구분해 남겨야 나중에 같은 상품이 다시
 * 신고됐을 때 "전에 한 번 보고 넘긴 상품" 임을 알 수 있다.
 */
export async function resolveProductReports(
  actor: Actor,
  productId: string,
  resolution: ProductReportResolution,
  now: Date = new Date(),
): Promise<ResolveResult> {
  assertPermission(actor, 'product:moderate');

  let archived = false;
  if (resolution === 'archived') {
    // 권한·범위·상태 검사는 저쪽이 한다. 이미 보관된 상품이면 거기서 막힌다.
    await archiveProduct(actor, productId, 'ARCHIVE', now);
    archived = true;
  }

  const { count } = await prisma.productReport.updateMany({
    where: { productId, resolvedAt: null },
    data: { resolvedAt: now, resolvedById: actor.id, resolution },
  });

  /*
   * 닫을 것이 없으면 알린다 — 다만 상품을 이미 내린 뒤라면 그 사실은 되돌리지 않는다.
   * 내려간 것이 먼저이고, 대기줄에 줄이 없다는 것은 그 사이 다른 운영자가 닫았다는 뜻이다.
   */
  if (count === 0 && !archived) throw new ProductReportResolveError('NOTHING_TO_RESOLVE');

  return { productId, resolution, resolved: count, archived };
}
