import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

/**
 * 상품 복제 — 틀은 가져오고 팔리는 값은 두고 온다.
 */

const tx = vi.hoisted(() => ({
  product: { create: vi.fn<(...a: any[]) => any>() },
  productOptionGroup: { create: vi.fn<(...a: any[]) => any>() },
  productVariant: { create: vi.fn<(...a: any[]) => any>() },
  productImage: { createMany: vi.fn<(...a: any[]) => any>() },
}));
const db = vi.hoisted(() => ({
  product: { findFirst: vi.fn<(...a: any[]) => any>(), findUnique: vi.fn<(...a: any[]) => any>() },
  productSlug: { findUnique: vi.fn<(...a: any[]) => any>() },
  productVariant: { findMany: vi.fn<(...a: any[]) => any>() },
  $transaction: vi.fn<(...a: any[]) => any>(),
}));
vi.mock('@shop/db', () => ({ prisma: db }));
vi.mock('~/lib/restock/notify', () => ({ notifyRestocked: vi.fn() }));
const getActor = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/auth/session', () => ({ getActor }));
const recordAudit = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/audit', () => ({ recordAudit }));
const enforceRateLimit = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/rate-limit', () => ({ enforceRateLimit }));

const { duplicateProduct } = await import('~/lib/admin/duplicate-product');
const { POST } = await import('~/app/api/admin/products/[id]/duplicate/route');

const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };
const admin: Actor = { id: 'u-a', role: 'ADMIN', merchantId: null };
const customer: Actor = { id: 'u-c', role: 'CUSTOMER', merchantId: null };

const SOURCE = {
  id: 'p-1', slug: 'wool-coat', name: '울 코트', description: '두꺼운 울', brandId: 'b-1', categoryId: 'c-1',
  listPrice: 400_000, salePrice: 289_000, sellingPrice: 289_000,
  brand: { name: 'MOOR', merchantId: 'm-a' },
  optionGroups: [
    { id: 'g-size', name: '사이즈', sortOrder: 0, values: [{ id: 'ov-m', value: 'M', swatchHex: null, sortOrder: 0 }, { id: 'ov-l', value: 'L', swatchHex: null, sortOrder: 1 }] },
  ],
  variants: [
    { sku: 'COAT-M', label: 'M', priceOverride: null, isActive: true, optionValues: [{ id: 'ov-m' }] },
    { sku: 'COAT-L', label: 'L', priceOverride: 5_000, isActive: false, optionValues: [{ id: 'ov-l' }] },
  ],
  images: [{ url: 'https://cdn/a.jpg', alt: '앞', sortOrder: 0, blurDataUrl: null, storageKey: 'products/p-1/a.jpg', credit: null, creditUrl: null }],
};

beforeEach(() => {
  vi.clearAllMocks();
  db.product.findFirst.mockResolvedValue(SOURCE);
  db.product.findUnique.mockResolvedValue(null);
  db.productSlug.findUnique.mockResolvedValue(null);
  db.productVariant.findMany.mockResolvedValue([]);
  db.$transaction.mockImplementation(async (fn: any) => fn(tx));
  tx.product.create.mockResolvedValue({ id: 'p-copy' });
  tx.productOptionGroup.create.mockResolvedValue({ values: [{ id: 'nv-m', value: 'M' }, { id: 'nv-l', value: 'L' }] });
  getActor.mockResolvedValue(admin);
  enforceRateLimit.mockResolvedValue(null);
});

describe('복제되는 것', () => {
  it('사본은 임시저장·"(사본)" 이름·-copy 주소로, 가격·설명·브랜드·카테고리는 그대로', async () => {
    const copy = await duplicateProduct(admin, 'p-1');
    const data = tx.product.create.mock.calls[0]![0].data;
    expect(data).toMatchObject({
      slug: 'wool-coat-copy', name: '울 코트 (사본)', status: 'DRAFT', description: '두꺼운 울',
      brandId: 'b-1', categoryId: 'c-1', listPrice: 400_000, salePrice: 289_000, sellingPrice: 289_000,
    });
    // 게시·검수 흔적과 평판은 가져오지 않는다
    for (const key of ['publishedAt', 'reviewRequestedAt', 'ratingSum', 'reviewCount', 'soldCount']) expect(data).not.toHaveProperty(key);
    expect(copy).toEqual({ id: 'p-copy', slug: 'wool-coat-copy', name: '울 코트 (사본)', sourceId: 'p-1', variants: 2, images: 1 });
  });

  it('옵션은 재고 0 · 사본 SKU 로, 추가금·판매 여부는 그대로, 새 옵션 값에 다시 잇는다', async () => {
    await duplicateProduct(admin, 'p-1');
    const [m, l] = tx.productVariant.create.mock.calls.map((c) => c[0].data);
    expect(m).toMatchObject({ productId: 'p-copy', sku: 'COAT-M-C', stock: 0, priceOverride: null, isActive: true, optionValues: { connect: [{ id: 'nv-m' }] } });
    expect(l).toMatchObject({ sku: 'COAT-L-C', stock: 0, priceOverride: 5_000, isActive: false, optionValues: { connect: [{ id: 'nv-l' }] } });
  });

  it('사진은 같은 파일을 가리키는 줄로 — 새로 올리지 않는다', async () => {
    await duplicateProduct(admin, 'p-1');
    expect(tx.productImage.createMany.mock.calls[0]![0].data).toEqual([
      { ...SOURCE.images[0], productId: 'p-copy' },
    ]);
  });

  it('주소·SKU 가 이미 있으면 다음 후보로 — 한 번에 모아 묻는다', async () => {
    db.product.findUnique.mockImplementation(async ({ where }: { where: { slug: string } }) => (where.slug === 'wool-coat-copy' ? { id: 'x' } : null));
    db.productVariant.findMany.mockResolvedValue([{ sku: 'COAT-M-C' }]);
    const copy = await duplicateProduct(admin, 'p-1');
    expect(copy.slug).toBe('wool-coat-copy-2');
    expect(tx.productVariant.create.mock.calls.map((c) => c[0].data.sku)).toEqual(['COAT-M-C2', 'COAT-L-C']);
    expect(db.productVariant.findMany).toHaveBeenCalledTimes(1);
  });
});

describe('막는 것', () => {
  it('가맹점은 자기 브랜드만 — 조회에 범위를 걸고, 남의 상품은 없는 상품으로', async () => {
    await duplicateProduct(merchant, 'p-1');
    expect(db.product.findFirst.mock.calls[0]![0].where).toMatchObject({ brand: { merchantId: 'm-a' } });
    db.product.findFirst.mockResolvedValue(null);
    await expect(duplicateProduct(merchant, 'p-9')).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND', status: 404 });
    expect(tx.product.create).toHaveBeenCalledTimes(1);
  });

  it('상품을 쓸 권한이 없으면 복제하지 않는다', async () => {
    await expect(duplicateProduct(customer, 'p-1')).rejects.toThrow();
    expect(db.product.findFirst).not.toHaveBeenCalled();
  });
});

describe('창구', () => {
  const call = () => POST(new Request('http://localhost/api/admin/products/p-1/duplicate', { method: 'POST' }), { params: Promise.resolve({ id: 'p-1' }) });

  it('201 과 사본 id 를 주고, 무엇에서 만들었는지 감사 로그에 남긴다', async () => {
    const response = await call();
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ id: 'p-copy' });
    expect(recordAudit.mock.calls[0]![0]).toMatchObject({ action: 'product.duplicate', targetType: 'product', targetId: 'p-copy', after: { sourceId: 'p-1' } });
  });

  it('없는 상품은 404, 로그인 없으면 401, 요청 제한이면 만들지 않는다', async () => {
    db.product.findFirst.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
    getActor.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
    getActor.mockResolvedValue(admin);
    enforceRateLimit.mockResolvedValue(new Response(null, { status: 429 }));
    expect((await call()).status).toBe(429);
    expect(recordAudit).not.toHaveBeenCalled();
  });
});

describe('사본이 많이 쌓였을 때', () => {
  it('후보 스무 개가 다 차 있어도 막히지 않고 시각으로 지은 번호로 간다', async () => {
    db.product.findUnique.mockImplementation(async ({ where }: { where: { slug: string } }) =>
      (/-copy(-([2-9]|1\d|20))?$/.test(where.slug) ? { id: 'x' } : null));
    db.productVariant.findMany.mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => ({ sku: i === 0 ? 'COAT-M-C' : `COAT-M-C${i + 1}` })),
    );
    const copy = await duplicateProduct(admin, 'p-1');
    expect(copy.slug).toMatch(/^wool-coat-copy-\d{2,}$/);
    expect(Number(copy.slug.split('-').at(-1))).toBeGreaterThan(20);
    expect(tx.productVariant.create.mock.calls[0]![0].data.sku).toMatch(/^COAT-M-C\d{2,}$/);
  });
});
