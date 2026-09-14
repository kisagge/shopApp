import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor, StockEntry } from '@shop/core';

/**
 * 재고 일괄 수정 — 적용.
 *
 * 파일 읽기는 core 의 stock-upload 가 본다. 여기서 보는 것은 **상품 화면의 재고 수정과 같은 길을
 * 타는가**(범위·재입고 알림·감사 로그), **바뀐 것만 적용하는가**, **남의 SKU 를 새지 않는가**다.
 */

const db = vi.hoisted(() => ({
  productVariant: { findMany: vi.fn<(...a: any[]) => any>(), count: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const updateStockAudited = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/admin/manage-product', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/lib/admin/manage-product')>()),
  updateStockAudited,
}));

const { bulkUpdateStock, exportStock, StockExportTooLargeError, STOCK_EXPORT_MAX_ROWS } = await import('~/lib/admin/bulk-stock');
const { ProductError } = await import('~/lib/admin/manage-product');

const admin: Actor = { id: 'u-a', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };
const request = new Request('http://localhost/api/admin/products/stock/bulk', { method: 'POST' });

const variant = (sku: string, productId: string, stock: number, merchantId = 'm-a', isActive = true) => ({
  id: `v-${sku}`, sku, stock, isActive, productId, product: { brand: { merchantId } },
});
const entry = (sku: string, stock: number, line: number, isActive: boolean | null = null): StockEntry => ({ sku, stock, isActive, line });

beforeEach(() => {
  vi.clearAllMocks();
  updateStockAudited.mockResolvedValue({ before: [], after: [] });
});

describe('적용', () => {
  it('상품마다 한 번, 상품 화면과 같은 함수로 적용한다', async () => {
    db.productVariant.findMany.mockResolvedValue([
      variant('COAT-M', 'p-coat', 3), variant('COAT-L', 'p-coat', 4), variant('KNIT-M', 'p-knit', 0),
    ]);
    const result = await bulkUpdateStock(admin, [entry('COAT-M', 10, 2), entry('COAT-L', 12, 3), entry('KNIT-M', 5, 4, false)], request);

    expect(updateStockAudited).toHaveBeenCalledTimes(2);
    expect(updateStockAudited).toHaveBeenCalledWith(admin, 'p-coat', {
      variants: [{ variantId: 'v-COAT-M', stock: 10 }, { variantId: 'v-COAT-L', stock: 12 }],
    }, request);
    expect(updateStockAudited).toHaveBeenCalledWith(admin, 'p-knit', {
      variants: [{ variantId: 'v-KNIT-M', stock: 5, isActive: false }],
    }, request);
    expect(result).toEqual({ updated: 3, unchanged: 0, failures: [] });
  });

  it('값이 같은 줄은 건드리지 않고 따로 센다 — 감사 로그가 쌓이지 않는다', async () => {
    db.productVariant.findMany.mockResolvedValue([variant('COAT-M', 'p-coat', 3), variant('COAT-L', 'p-coat', 4, 'm-a', true)]);
    const result = await bulkUpdateStock(admin, [entry('COAT-M', 3, 2), entry('COAT-L', 4, 3, true)], request);
    expect(updateStockAudited).not.toHaveBeenCalled();
    expect(result).toEqual({ updated: 0, unchanged: 2, failures: [] });
  });

  it('판매 여부만 바뀌어도 적용한다', async () => {
    db.productVariant.findMany.mockResolvedValue([variant('COAT-M', 'p-coat', 3, 'm-a', true)]);
    const result = await bulkUpdateStock(admin, [entry('COAT-M', 3, 2, false)], request);
    expect(result.updated).toBe(1);
  });

  it('한 상품이 막혀도 다른 상품은 적용하고, 막힌 줄은 사유와 함께 돌려준다', async () => {
    db.productVariant.findMany.mockResolvedValue([variant('COAT-M', 'p-coat', 3), variant('KNIT-M', 'p-knit', 1)]);
    updateStockAudited
      .mockRejectedValueOnce(new ProductError('BRAND_NOT_ALLOWED', 403))
      .mockResolvedValueOnce({ before: [], after: [] });

    const result = await bulkUpdateStock(admin, [entry('COAT-M', 9, 2), entry('KNIT-M', 9, 3)], request);
    expect(result.updated).toBe(1);
    expect(result.failures).toEqual([expect.objectContaining({ sku: 'COAT-M', lines: [2], code: 'BRAND_NOT_ALLOWED' })]);
  });

  it('모르는 오류는 삼키지 않는다', async () => {
    db.productVariant.findMany.mockResolvedValue([variant('COAT-M', 'p-coat', 3)]);
    updateStockAudited.mockRejectedValue(new Error('connection lost'));
    await expect(bulkUpdateStock(admin, [entry('COAT-M', 9, 2)], request)).rejects.toThrow('connection lost');
  });
});

describe('범위', () => {
  it('가맹점은 자기 브랜드 옵션만 찾는다', async () => {
    db.productVariant.findMany.mockResolvedValue([]);
    await bulkUpdateStock(merchant, [entry('COAT-M', 9, 2)], request);
    expect(db.productVariant.findMany.mock.calls[0]![0].where).toMatchObject({
      product: { deletedAt: null, brand: { merchantId: 'm-a' } },
    });
  });

  it('남의 SKU 는 없는 SKU 와 똑같이 답한다 — 넣어 보는 것으로 남의 상품을 알아내지 못한다', async () => {
    db.productVariant.findMany.mockResolvedValue([variant('OTHER-M', 'p-other', 3, 'm-b')]);
    const result = await bulkUpdateStock(merchant, [entry('OTHER-M', 9, 2), entry('NONE', 1, 3)], request);
    expect(updateStockAudited).not.toHaveBeenCalled();
    expect(result.failures.map((f) => [f.sku, f.code, f.message])).toEqual([
      ['OTHER-M', 'SKU_NOT_FOUND', '없는 SKU 입니다.'],
      ['NONE', 'SKU_NOT_FOUND', '없는 SKU 입니다.'],
    ]);
  });

  it('상품을 고칠 권한이 없으면 적용하지 않는다', async () => {
    await expect(bulkUpdateStock({ id: 'u-c', role: 'CUSTOMER', merchantId: null }, [entry('A', 1, 2)], request)).rejects.toThrow();
    expect(updateStockAudited).not.toHaveBeenCalled();
  });
});

describe('내려받기', () => {
  it('SKU·브랜드·상품·옵션·판매·재고를 한 줄씩 준다', async () => {
    db.productVariant.count.mockResolvedValue(1);
    db.productVariant.findMany.mockResolvedValue([
      { sku: 'COAT-M', label: '오트 / M', stock: 3, isActive: false, product: { name: '울 코트', brand: { name: 'MOOR' } } },
    ]);
    expect(await exportStock(merchant)).toEqual([['COAT-M', 'MOOR', '울 코트', '오트 / M', '판매중지', '3']]);
    expect(db.productVariant.findMany.mock.calls[0]![0].where.product).toEqual({ deletedAt: null, brand: { merchantId: 'm-a' } });
  });

  it('한도를 넘으면 읽기 전에 멈춘다', async () => {
    db.productVariant.count.mockResolvedValue(STOCK_EXPORT_MAX_ROWS + 1);
    await expect(exportStock(admin)).rejects.toBeInstanceOf(StockExportTooLargeError);
    expect(db.productVariant.findMany).not.toHaveBeenCalled();
  });
});
