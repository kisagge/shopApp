import 'server-only';
import { prisma } from '@shop/db';
import {
  assertPermission, canManageProduct, merchantScope, activeLabel,
  type Actor, type StockEntry,
} from '@shop/core';
import { ProductError, updateStockAudited } from '~/lib/admin/manage-product';

/**
 * 재고 내려받기 · 일괄 수정.
 *
 * **내려받은 파일이 곧 올리는 양식이다.** SKU 로 옵션을 가리고, 재고 칸만 고쳐 올린다. 적용은
 * 상품 화면의 재고 수정과 같은 함수(updateStockAudited)를 상품마다 부른다 — 범위 검사·재입고
 * 알림·감사 로그가 일괄이라고 갈리면 안 된다.
 */

export const STOCK_EXPORT_MAX_ROWS = 5_000;

export class StockExportTooLargeError extends Error {
  constructor(readonly rows: number) {
    super(`내려받을 옵션이 ${rows.toLocaleString('ko-KR')}개로 한도(${STOCK_EXPORT_MAX_ROWS.toLocaleString('ko-KR')})를 넘습니다.`);
    this.name = 'StockExportTooLargeError';
  }
}

export const STOCK_CSV_HEADER = ['SKU', '브랜드', '상품', '옵션', '판매', '재고'] as const;

/** 가맹점에게는 자기 브랜드만. 지운 상품은 뺀다 — 고칠 수 없는 줄을 내주면 올릴 때 실패로 돌아온다 */
function scopedVariants(actor: Actor) {
  const scope = merchantScope(actor);
  if (scope === undefined) throw new ProductError('PRODUCT_NOT_FOUND', 404);
  return { product: { deletedAt: null, ...(scope ? { brand: { merchantId: scope } } : {}) } };
}

export async function exportStock(actor: Actor): Promise<string[][]> {
  assertPermission(actor, 'product:read');
  const where = scopedVariants(actor);

  const count = await prisma.productVariant.count({ where });
  if (count > STOCK_EXPORT_MAX_ROWS) throw new StockExportTooLargeError(count);

  const rows = await prisma.productVariant.findMany({
    where,
    orderBy: [{ product: { brand: { name: 'asc' } } }, { product: { name: 'asc' } }, { sku: 'asc' }],
    select: {
      sku: true, label: true, stock: true, isActive: true,
      product: { select: { name: true, brand: { select: { name: true } } } },
    },
  });

  return rows.map((v) => [
    v.sku, v.product.brand.name, v.product.name, v.label, activeLabel(v.isActive), String(v.stock),
  ]);
}

export interface BulkStockFailure {
  readonly sku: string;
  readonly lines: readonly number[];
  readonly code: string;
  readonly message: string;
}

export interface BulkStockResult {
  readonly updated: number;
  /** 파일의 값이 지금과 같아 건드리지 않은 옵션 */
  readonly unchanged: number;
  readonly failures: readonly BulkStockFailure[];
}

export async function bulkUpdateStock(
  actor: Actor,
  entries: readonly StockEntry[],
  request: Request,
): Promise<BulkStockResult> {
  assertPermission(actor, 'product:write');
  const where = scopedVariants(actor);

  const variants = await prisma.productVariant.findMany({
    where: { ...where, sku: { in: entries.map((e) => e.sku) } },
    select: {
      id: true, sku: true, stock: true, isActive: true, productId: true,
      product: { select: { brand: { select: { merchantId: true } } } },
    },
  });
  const bySku = new Map(variants.map((v) => [v.sku.toUpperCase(), v]));

  const failures: BulkStockFailure[] = [];
  let unchanged = 0;
  const byProduct = new Map<string, { entry: StockEntry; variantId: string }[]>();

  for (const entry of entries) {
    const variant = bySku.get(entry.sku);
    /*
     * **남의 SKU 와 없는 SKU 를 같게 답한다.** "권한 없음" 으로 가르면 SKU 를 넣어 보는 것만으로 다른
     * 가맹점의 상품이 있는지 알아낸다. 범위 밖 옵션은 위 조회에서 이미 빠진다.
     */
    if (!variant || !canManageProduct(actor, { merchantId: variant.product.brand.merchantId })) {
      failures.push({ sku: entry.sku, lines: [entry.line], code: 'SKU_NOT_FOUND', message: '없는 SKU 입니다.' });
      continue;
    }

    /*
     * **값이 같으면 건드리지 않는다.** 내려받은 파일에서 몇 줄만 고쳐 통째로 올리는 것이 보통이다.
     * 전부 적용하면 수백 줄의 감사 로그가 "재고 조정" 으로 쌓이고 "300개 수정" 이라고 말한다 —
     * 이번에 무엇을 바꿨는지 알 수 없다. 송장 일괄 등록에서 같은 것을 겪었다.
     */
    const sameActive = entry.isActive === null || entry.isActive === variant.isActive;
    if (variant.stock === entry.stock && sameActive) {
      unchanged += 1;
      continue;
    }

    const list = byProduct.get(variant.productId) ?? [];
    list.push({ entry, variantId: variant.id });
    byProduct.set(variant.productId, list);
  }

  let updated = 0;
  // 상품마다 한 번 — 재입고 알림과 감사 로그가 상품 단위다
  for (const [productId, list] of byProduct) {
    try {
      await updateStockAudited(
        actor,
        productId,
        {
          variants: list.map(({ entry, variantId }) => ({
            variantId,
            stock: entry.stock,
            ...(entry.isActive === null ? {} : { isActive: entry.isActive }),
          })),
        },
        request,
      );
      updated += list.length;
    } catch (error) {
      if (!(error instanceof ProductError)) throw error;
      for (const { entry } of list) {
        failures.push({ sku: entry.sku, lines: [entry.line], code: error.code, message: error.message });
      }
    }
  }

  return { updated, unchanged, failures };
}
