import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

/**
 * 상품 보관 — 지우지 않고 매대에서 뺀다. 되돌리기는 보관한 쪽을 본다.
 */

const db = vi.hoisted(() => ({
  product: { findFirst: vi.fn<(...a: any[]) => any>(), updateMany: vi.fn<(...a: any[]) => any>() },
  orderItem: { count: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db }));
vi.mock('~/lib/restock/notify', () => ({ notifyRestocked: vi.fn() }));
const getActor = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/auth/session', () => ({ getActor }));
const recordAudit = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/audit', () => ({ recordAudit }));
const enforceRateLimit = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/rate-limit', () => ({ enforceRateLimit }));
const revalidateCatalog = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/cache', () => ({ revalidateCatalog }));

const { archiveProduct, countUnshippedLines } = await import('~/lib/admin/archive-product');
const { PATCH } = await import('~/app/api/admin/products/[id]/archive/route');

const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };
const admin: Actor = { id: 'u-a', role: 'ADMIN', merchantId: null };
const customer: Actor = { id: 'u-c', role: 'CUSTOMER', merchantId: null };
const NOW = new Date('2026-09-15T03:00:00Z');

const live = { id: 'p-1', name: '울 코트', status: 'ACTIVE', deletedAt: null, archivedBy: null, brand: { merchantId: 'm-a' } };
const archivedBy = (who: 'MERCHANT' | 'STAFF') => ({ ...live, deletedAt: new Date('2026-09-01'), archivedBy: who });

beforeEach(() => {
  vi.clearAllMocks();
  db.product.findFirst.mockResolvedValue(live);
  db.product.updateMany.mockResolvedValue({ count: 1 });
  getActor.mockResolvedValue(admin);
  enforceRateLimit.mockResolvedValue(null);
});

describe('archiveProduct', () => {
  it('보관하면 지우지 않고 보관한 때와 쪽을 적는다 — 상태는 그대로다', async () => {
    const { after } = await archiveProduct(merchant, 'p-1', 'ARCHIVE', NOW);
    expect(db.product.updateMany).toHaveBeenCalledWith({
      where: { id: 'p-1', deletedAt: null },
      data: { deletedAt: NOW, archivedBy: 'MERCHANT' },
    });
    expect(after).toMatchObject({ status: 'ACTIVE', deletedAt: NOW, archivedBy: 'MERCHANT' });
  });

  it('운영진이 보관하면 STAFF 로 적는다', async () => {
    await archiveProduct(admin, 'p-1', 'ARCHIVE', NOW);
    expect(db.product.updateMany.mock.calls[0]?.[0].data).toEqual({ deletedAt: NOW, archivedBy: 'STAFF' });
  });

  it('가맹점은 자기 브랜드 안에서만 찾는다 — 보관한 상품도 찾는다', async () => {
    await archiveProduct(merchant, 'p-1', 'ARCHIVE', NOW);
    const where = db.product.findFirst.mock.calls[0]?.[0].where;
    expect(where).toEqual({ id: 'p-1', brand: { merchantId: 'm-a' } });
    expect(where).not.toHaveProperty('deletedAt');
  });

  it('범위 밖이면 없는 상품이다', async () => {
    db.product.findFirst.mockResolvedValue(null);
    await expect(archiveProduct(merchant, 'p-x', 'ARCHIVE', NOW)).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND', status: 404 });
    await expect(archiveProduct(customer, 'p-1', 'ARCHIVE', NOW)).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
    expect(db.product.updateMany).not.toHaveBeenCalled();
  });

  it('되돌리면 두 칸을 비운다', async () => {
    db.product.findFirst.mockResolvedValue(archivedBy('MERCHANT'));
    await archiveProduct(merchant, 'p-1', 'RESTORE', NOW);
    expect(db.product.updateMany).toHaveBeenCalledWith({
      where: { id: 'p-1', deletedAt: { not: null } },
      data: { deletedAt: null, archivedBy: null },
    });
  });

  it('운영진이 보관한 상품을 가맹점은 못 되돌린다', async () => {
    db.product.findFirst.mockResolvedValue(archivedBy('STAFF'));
    await expect(archiveProduct(merchant, 'p-1', 'RESTORE', NOW)).rejects.toMatchObject({ code: 'RESTORE_NOT_ALLOWED', status: 403 });
    expect(db.product.updateMany).not.toHaveBeenCalled();
  });

  it('동시에 눌러 이미 바뀌었으면 이미 된 일이라고 답한다', async () => {
    db.product.updateMany.mockResolvedValue({ count: 0 });
    await expect(archiveProduct(admin, 'p-1', 'ARCHIVE', NOW)).rejects.toMatchObject({ code: 'ALREADY_ARCHIVED', status: 409 });
  });

  it('이미 보관한 것을 또 보관하지 않는다', async () => {
    db.product.findFirst.mockResolvedValue(archivedBy('MERCHANT'));
    await expect(archiveProduct(admin, 'p-1', 'ARCHIVE', NOW)).rejects.toMatchObject({ code: 'ALREADY_ARCHIVED' });
  });
});

describe('countUnshippedLines', () => {
  it('취소되지 않은 결제완료·상품준비 줄을 센다', async () => {
    db.orderItem.count.mockResolvedValue(2);
    expect(await countUnshippedLines('p-1')).toBe(2);
    expect(db.orderItem.count.mock.calls[0]?.[0].where).toEqual({
      variant: { productId: 'p-1' }, canceledAt: null, status: { in: ['PAID', 'PREPARING'] },
    });
  });
});

describe('PATCH /api/admin/products/[id]/archive', () => {
  const call = (body: unknown) =>
    PATCH(
      new Request('http://localhost/api/admin/products/p-1/archive', { method: 'PATCH', body: JSON.stringify(body) }),
      { params: Promise.resolve({ id: 'p-1' }) },
    );

  it('보관하면 캐시를 털고 감사 로그에 보관으로 남긴다', async () => {
    const res = await call({ action: 'ARCHIVE' });
    expect(res.status).toBe(200);
    expect(revalidateCatalog).toHaveBeenCalled();
    expect(recordAudit.mock.calls[0]?.[0]).toMatchObject({ action: 'product.archive', targetType: 'product', targetId: 'p-1' });
  });

  it('되돌리면 되돌리기로 남긴다', async () => {
    db.product.findFirst.mockResolvedValue(archivedBy('STAFF'));
    await call({ action: 'RESTORE' });
    expect(recordAudit.mock.calls[0]?.[0]).toMatchObject({ action: 'product.restore' });
  });

  it('로그인하지 않았으면 401, 모르는 동작이면 400', async () => {
    getActor.mockResolvedValueOnce(null);
    expect((await call({ action: 'ARCHIVE' })).status).toBe(401);
    expect((await call({ action: 'DELETE' })).status).toBe(400);
    expect(db.product.updateMany).not.toHaveBeenCalled();
  });

  it('막히면 코드와 이유를 돌려주고 기록하지 않는다', async () => {
    getActor.mockResolvedValue(merchant);
    db.product.findFirst.mockResolvedValue(archivedBy('STAFF'));
    const res = await call({ action: 'RESTORE' });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'RESTORE_NOT_ALLOWED' });
    expect(recordAudit).not.toHaveBeenCalled();
    expect(revalidateCatalog).not.toHaveBeenCalled();
  });

  it('요청 제한에 걸리면 그대로 돌려준다', async () => {
    enforceRateLimit.mockResolvedValue(new Response(null, { status: 429 }));
    expect((await call({ action: 'ARCHIVE' })).status).toBe(429);
  });
});
