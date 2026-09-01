import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';
import { createProductSchema, updateProductSchema } from '@shop/contract';

const db = vi.hoisted(() => ({
  brand: { findUnique: vi.fn<(...a: any[]) => any>(), findMany: vi.fn<(...a: any[]) => any>() },
  category: { findUnique: vi.fn<(...a: any[]) => any>(), findMany: vi.fn<(...a: any[]) => any>() },
  product: { findUnique: vi.fn<(...a: any[]) => any>(), findFirst: vi.fn<(...a: any[]) => any>(), create: vi.fn<(...a: any[]) => any>(), update: vi.fn<(...a: any[]) => any>() },
  productVariant: { findMany: vi.fn<(...a: any[]) => any>(), findUnique: vi.fn<(...a: any[]) => any>(), update: vi.fn<(...a: any[]) => any>(), create: vi.fn<(...a: any[]) => any>() },
  $transaction: vi.fn<(...a: any[]) => any>(),
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const { createProduct, updateProduct, updateStock, createVariant, getProductFormOptions } =
  await import('~/lib/admin/manage-product');

const admin: Actor = { id: 'u-admin', role: 'ADMIN', merchantId: null };
const merchantA: Actor = { id: 'u-a', role: 'MERCHANT', merchantId: 'm-a' };
const merchantB: Actor = { id: 'u-b', role: 'MERCHANT', merchantId: 'm-b' };
const customer: Actor = { id: 'u-c', role: 'CUSTOMER', merchantId: null };

/**
 * 입력은 반드시 계약을 통과시켜 만든다. 서비스에 생 객체를 바로 넣으면
 * 스키마가 값을 덧붙이거나 지우는 사고를 테스트가 못 본다.
 */
const input = createProductSchema.parse({
  slug: 'oat-coat', name: '오트 코트',
  brandId: 'clh1abc2300000000000000000', categoryId: 'clh1abc2300000000000000001',
  listPrice: 413_000, salePrice: 289_000, status: 'ACTIVE',
});
const patch = (raw: unknown) => updateProductSchema.parse(raw);

const existing = {
  id: 'p-1', slug: 'oat-coat', name: '오트 코트', description: '',
  listPrice: 413_000, salePrice: 289_000, status: 'ACTIVE',
  brandId: 'clh1abc2300000000000000000', categoryId: 'clh1abc2300000000000000001',
  publishedAt: new Date('2026-01-01'),
  brand: { merchantId: 'm-a' },
};

beforeEach(() => {
  vi.clearAllMocks();
  db.brand.findUnique.mockResolvedValue({ merchantId: 'm-a' });
  db.category.findUnique.mockResolvedValue({ id: 'c-1' });
  db.product.findUnique.mockResolvedValue(null);
  db.product.findFirst.mockResolvedValue(existing);
  db.product.create.mockResolvedValue({ id: 'p-new', slug: input.slug, name: input.name, status: 'ACTIVE' });
  db.product.update.mockImplementation(({ data }: { data: unknown }) => Promise.resolve({ id: 'p-1', ...(data as object) }));
  db.$transaction.mockResolvedValue([]);
});

describe('상품 등록 — 브랜드 소유 검증', () => {
  it('자기 브랜드에는 등록할 수 있다', async () => {
    await expect(createProduct(merchantA, input)).resolves.toMatchObject({ id: 'p-new' });
  });

  it('남의 브랜드에는 등록할 수 없다', async () => {
    await expect(createProduct(merchantB, input)).rejects.toMatchObject({
      code: 'BRAND_NOT_ALLOWED', status: 403,
    });
    expect(db.product.create).not.toHaveBeenCalled();
  });

  it('관리자는 어느 브랜드에도 등록할 수 있다', async () => {
    await expect(createProduct(admin, input)).resolves.toBeDefined();
  });

  it('고객은 product:write 가 없다', async () => {
    await expect(createProduct(customer, input)).rejects.toMatchObject({ code: 'BRAND_NOT_ALLOWED' });
  });

  it('없는 브랜드 id 로도 뚫리지 않는다', async () => {
    db.brand.findUnique.mockResolvedValue(null);
    await expect(createProduct(admin, input)).rejects.toMatchObject({ code: 'BRAND_NOT_ALLOWED' });
  });

  it('슬러그가 겹치면 거절한다', async () => {
    db.product.findUnique.mockResolvedValue({ id: 'p-other' });
    await expect(createProduct(merchantA, input)).rejects.toMatchObject({
      code: 'SLUG_TAKEN', status: 409,
    });
  });

  it('없는 카테고리는 거절한다', async () => {
    db.category.findUnique.mockResolvedValue(null);
    await expect(createProduct(merchantA, input)).rejects.toMatchObject({ code: 'CATEGORY_NOT_FOUND' });
  });

  it('DRAFT 로 등록하면 게시 시각을 찍지 않는다', async () => {
    await createProduct(merchantA, { ...input, status: 'DRAFT' });
    expect(db.product.create.mock.calls[0]?.[0].data.publishedAt).toBeNull();
  });

  it('ACTIVE 로 등록하면 게시 시각을 찍는다', async () => {
    await createProduct(merchantA, input);
    expect(db.product.create.mock.calls[0]?.[0].data.publishedAt).toBeInstanceOf(Date);
  });
});

describe('상품 수정', () => {
  it('남의 상품은 조회 단계에서 걸린다', async () => {
    // merchantScope 가 where 에 들어가 findFirst 가 null 을 준다
    db.product.findFirst.mockResolvedValue(null);
    await expect(updateProduct(merchantB, 'p-1', patch({ name: '바꾼 이름' }))).rejects.toMatchObject({
      code: 'PRODUCT_NOT_FOUND', status: 404,
    });
    expect(db.product.update).not.toHaveBeenCalled();
  });

  it('가맹점 조회에는 브랜드 범위가 where 에 들어간다', async () => {
    await updateProduct(merchantA, 'p-1', patch({ name: '바꾼 이름' }));
    expect(db.product.findFirst.mock.calls[0]?.[0].where).toMatchObject({
      brand: { merchantId: 'm-a' },
    });
  });

  it('관리자 조회에는 브랜드 범위가 없다', async () => {
    await updateProduct(admin, 'p-1', patch({ name: '바꾼 이름' }));
    expect(db.product.findFirst.mock.calls[0]?.[0].where.brand).toBeUndefined();
  });

  it('남의 브랜드로 옮길 수 없다', async () => {
    db.brand.findUnique.mockResolvedValue({ merchantId: 'm-b' });
    await expect(updateProduct(merchantA, 'p-1', patch({ brandId: 'clh1abc2300000000000000009' }))).rejects.toMatchObject({
      code: 'BRAND_NOT_ALLOWED', status: 403,
    });
    expect(db.product.update).not.toHaveBeenCalled();
  });

  it('이미 게시된 상품을 다시 공개해도 게시 시각을 덮어쓰지 않는다', async () => {
    await updateProduct(merchantA, 'p-1', patch({ status: 'ACTIVE' }));
    expect(db.product.update.mock.calls[0]?.[0].data.publishedAt).toBeUndefined();
  });

  it('처음 공개할 때는 게시 시각을 찍는다', async () => {
    db.product.findFirst.mockResolvedValue({ ...existing, publishedAt: null, status: 'DRAFT' });
    await updateProduct(merchantA, 'p-1', patch({ status: 'ACTIVE' }));
    expect(db.product.update.mock.calls[0]?.[0].data.publishedAt).toBeInstanceOf(Date);
  });

  it('보내지 않은 필드는 건드리지 않는다', async () => {
    await updateProduct(merchantA, 'p-1', patch({ name: '바꾼 이름' }));
    // 계약을 통과한 입력이라도 UPDATE 문에 name 하나만 실려야 한다
    expect(Object.keys(db.product.update.mock.calls[0]?.[0].data)).toEqual(['name']);
  });

  it('변경 전 값을 감사 로그용으로 함께 돌려준다', async () => {
    const { before } = await updateProduct(merchantA, 'p-1', patch({ listPrice: 400_000 }));
    expect(before.listPrice).toBe(413_000);
  });
});

describe('재고 조정', () => {
  const variants = [
    { variantId: 'v-1', stock: 12 },
    { variantId: 'v-2', stock: 0 },
  ];

  it('내 상품의 옵션 재고를 덮어쓴다', async () => {
    db.productVariant.findMany.mockResolvedValue([
      { id: 'v-1', sku: 'A-1', stock: 3 },
      { id: 'v-2', sku: 'A-2', stock: 5 },
    ]);
    const result = await updateStock(merchantA, 'p-1', { variants });
    expect(result.after).toEqual([
      { sku: 'A-1', stock: 12 },
      { sku: 'A-2', stock: 0 },
    ]);
    expect(db.$transaction).toHaveBeenCalledOnce();
  });

  it('남의 상품 옵션 id 를 끼워 넣으면 통째로 거절한다', async () => {
    // 두 개를 보냈는데 이 상품 소유로 확인된 것은 하나뿐
    db.productVariant.findMany.mockResolvedValue([{ id: 'v-1', sku: 'A-1', stock: 3 }]);
    await expect(updateStock(merchantA, 'p-1', { variants })).rejects.toMatchObject({
      code: 'PRODUCT_NOT_FOUND',
    });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('남의 상품이면 조회에서 걸린다', async () => {
    db.product.findFirst.mockResolvedValue(null);
    await expect(updateStock(merchantB, 'p-1', { variants })).rejects.toMatchObject({
      code: 'PRODUCT_NOT_FOUND',
    });
  });
});

describe('옵션 추가', () => {
  it('SKU 가 겹치면 거절한다', async () => {
    db.productVariant.findUnique.mockResolvedValue({ id: 'v-x' });
    await expect(
      createVariant(merchantA, 'p-1', { sku: 'A-1', optionLabel: '오트밀 / M', stock: 3 }),
    ).rejects.toMatchObject({ code: 'SKU_TAKEN', status: 409 });
  });

  it('남의 상품에는 옵션을 붙일 수 없다', async () => {
    db.product.findFirst.mockResolvedValue(null);
    await expect(
      createVariant(merchantB, 'p-1', { sku: 'B-1', optionLabel: 'M', stock: 0 }),
    ).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
    expect(db.productVariant.create).not.toHaveBeenCalled();
  });

  it('optionLabel 은 스키마의 label 컬럼으로 들어간다', async () => {
    db.productVariant.findUnique.mockResolvedValue(null);
    db.productVariant.create.mockResolvedValue({ id: 'v-9', sku: 'A-9', label: 'M', stock: 2 });
    await createVariant(merchantA, 'p-1', { sku: 'A-9', optionLabel: 'M', stock: 2 });
    expect(db.productVariant.create.mock.calls[0]?.[0].data.label).toBe('M');
  });
});

describe('폼 선택지', () => {
  beforeEach(() => {
    db.brand.findMany.mockResolvedValue([{ id: 'b-a', name: 'MOOR' }]);
    db.category.findMany.mockResolvedValue([
      { id: 'c-1', name: '코트', parent: { name: '아우터' } },
      { id: 'c-2', name: '가방', parent: null },
    ]);
  });

  it('가맹점에게는 자기 브랜드만 준다', async () => {
    await getProductFormOptions(merchantA);
    expect(db.brand.findMany.mock.calls[0]?.[0].where).toEqual({ merchantId: 'm-a' });
  });

  it('관리자에게는 전체 브랜드를 준다', async () => {
    await getProductFormOptions(admin);
    expect(db.brand.findMany.mock.calls[0]?.[0].where).toEqual({});
  });

  it('카테고리는 말단만, 상위 이름을 붙여 준다', async () => {
    const options = await getProductFormOptions(admin);
    expect(db.category.findMany.mock.calls[0]?.[0].where).toEqual({ children: { none: {} } });
    expect(options.categories).toEqual([
      { id: 'c-1', label: '아우터 > 코트' },
      { id: 'c-2', label: '가방' },
    ]);
  });
});
