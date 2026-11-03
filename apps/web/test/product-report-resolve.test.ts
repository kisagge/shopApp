import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenError, type Actor } from '@shop/core';

const db = vi.hoisted(() => ({
  productReport: { updateMany: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const archiveProduct = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/admin/archive-product', () => ({ archiveProduct }));

const { resolveProductReports, ProductReportResolveError } =
  await import('~/lib/admin/manage-product-reports');

/**
 * 상품 신고 처리.
 *
 * **상품을 내리는 것과 신고를 닫는 것은 다른 일이고, 순서가 요점이다.**
 */

const admin: Actor = { id: 'u-admin', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-1' };
const NOW = new Date('2026-11-03T00:00:00Z');

beforeEach(() => {
  vi.clearAllMocks();
  db.productReport.updateMany.mockResolvedValue({ count: 2 });
  archiveProduct.mockResolvedValue({ before: {}, after: {} });
});

describe('누가 처리할 수 있는가', () => {
  /** 신고의 대상이 파는 쪽이다 — 그 쪽이 자기 건을 닫으면 신고가 운영진에게 닿지 않는다 */
  it('가맹점은 막힌다', async () => {
    await expect(resolveProductReports(merchant, 'p-1', 'kept', NOW)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(db.productReport.updateMany).not.toHaveBeenCalled();
    expect(archiveProduct).not.toHaveBeenCalled();
  });
});

describe('문제없음으로 닫을 때', () => {
  it('상품은 건드리지 않는다', async () => {
    await resolveProductReports(admin, 'p-1', 'kept', NOW);

    expect(archiveProduct).not.toHaveBeenCalled();
  });

  /** 지운 것과 구분해 남겨야 "전에 한 번 보고 넘긴 상품" 임을 알 수 있다 */
  it('누가 언제 어떻게 닫았는지 남긴다', async () => {
    await resolveProductReports(admin, 'p-1', 'kept', NOW);

    expect(db.productReport.updateMany).toHaveBeenCalledWith({
      where: { productId: 'p-1', resolvedAt: null },
      data: { resolvedAt: NOW, resolvedById: 'u-admin', resolution: 'kept' },
    });
  });

  it('닫은 수를 돌려준다', async () => {
    expect(await resolveProductReports(admin, 'p-1', 'kept', NOW)).toEqual({
      productId: 'p-1',
      resolution: 'kept',
      resolved: 2,
      archived: false,
    });
  });

  it('닫을 것이 없으면 알린다', async () => {
    db.productReport.updateMany.mockResolvedValue({ count: 0 });

    await expect(resolveProductReports(admin, 'p-1', 'kept', NOW)).rejects.toBeInstanceOf(
      ProductReportResolveError,
    );
  });
});

describe('내릴 때', () => {
  /**
   * **먼저 내리고 나서 닫는다.** 닫기가 먼저면 내리기가 실패했을 때 대기줄에서는 사라졌는데
   * 상품은 그대로가 되고, 그 상품은 아무도 다시 보지 않는다.
   */
  it('보관이 실패하면 신고를 닫지 않는다', async () => {
    archiveProduct.mockRejectedValue(new Error('이미 보관됨'));

    await expect(resolveProductReports(admin, 'p-1', 'archived', NOW)).rejects.toThrow();
    expect(db.productReport.updateMany).not.toHaveBeenCalled();
  });

  it('기존 보관 경로를 그대로 쓴다 — 경로가 둘이면 한쪽만 기록을 남긴다', async () => {
    await resolveProductReports(admin, 'p-1', 'archived', NOW);

    expect(archiveProduct).toHaveBeenCalledWith(admin, 'p-1', 'ARCHIVE', NOW);
  });

  it('내린 뒤 신고를 보관으로 닫는다', async () => {
    const result = await resolveProductReports(admin, 'p-1', 'archived', NOW);

    expect(db.productReport.updateMany.mock.calls[0]![0].data.resolution).toBe('archived');
    expect(result.archived).toBe(true);
  });

  /**
   * 내린 뒤에 닫을 줄이 없다면 그 사이 다른 운영자가 닫은 것이다. 내려간 것이 먼저이므로
   * 되돌리지 않는다 — 여기서 던지면 "내려갔는데 실패했다" 는 답을 주게 된다.
   */
  it('내린 뒤 닫을 것이 없어도 던지지 않는다', async () => {
    db.productReport.updateMany.mockResolvedValue({ count: 0 });

    await expect(resolveProductReports(admin, 'p-1', 'archived', NOW)).resolves.toMatchObject({
      archived: true,
      resolved: 0,
    });
  });
});
