import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';
import { createProductSchema, updateProductSchema } from '@shop/contract';

const db = vi.hoisted(() => ({
  brand: {
    findUnique: vi.fn<(...a: any[]) => any>(),
    findUniqueOrThrow: vi.fn<(...a: any[]) => any>(),
    findMany: vi.fn<(...a: any[]) => any>(),
  },
  category: { findUnique: vi.fn<(...a: any[]) => any>(), findMany: vi.fn<(...a: any[]) => any>() },
  product: { findUnique: vi.fn<(...a: any[]) => any>(), findFirst: vi.fn<(...a: any[]) => any>(), create: vi.fn<(...a: any[]) => any>(), update: vi.fn<(...a: any[]) => any>() },
  productVariant: { findMany: vi.fn<(...a: any[]) => any>(), findUnique: vi.fn<(...a: any[]) => any>(), update: vi.fn<(...a: any[]) => any>(), updateMany: vi.fn<(...a: any[]) => any>(), create: vi.fn<(...a: any[]) => any>() },
  productSlug: {
    findUnique: vi.fn<(...a: any[]) => any>(),
    upsert: vi.fn<(...a: any[]) => any>(),
    deleteMany: vi.fn<(...a: any[]) => any>(),
  },
  $transaction: vi.fn<(...a: any[]) => any>(),
}));
vi.mock('@shop/db', () => ({ prisma: db }));

/*
 * 검수 결과 알림은 갈아 끼운다. 여기서 볼 것은 **부르는가** 이지 누구에게
 * 닿는가가 아니다 — 받는 사람을 고르는 일은 product-review-notice 검사가 본다.
 */
const notifyProductReviewed = vi.hoisted(() => vi.fn<(...a: any[]) => any>(() => Promise.resolve()));
vi.mock('~/lib/notifications/product-review', () => ({ notifyProductReviewed }));

const {
  createProduct, updateProduct, updateStock, createVariant, getProductFormOptions,
  reviewProduct,
} = await import('~/lib/admin/manage-product');

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

/**
 * 가맹점이 실제로 보낼 수 있는 입력.
 *
 * 가맹점에게는 product:publish 가 없어서 ACTIVE 로는 등록할 수 없다.
 * 브랜드 범위나 가격 계산을 보는 테스트에 게시 권한을 섞지 않는다.
 */
const draftInput = createProductSchema.parse({
  slug: 'oat-coat', name: '오트 코트',
  brandId: 'clh1abc2300000000000000000', categoryId: 'clh1abc2300000000000000001',
  listPrice: 413_000, salePrice: 289_000, status: 'DRAFT',
});

const existing = {
  id: 'p-1', slug: 'oat-coat', name: '오트 코트', description: '',
  listPrice: 413_000, salePrice: 289_000, status: 'ACTIVE',
  brandId: 'clh1abc2300000000000000000', categoryId: 'clh1abc2300000000000000001',
  publishedAt: new Date('2026-01-01'),
  brand: { merchantId: 'm-a' },
};

beforeEach(() => {
  vi.clearAllMocks();
  db.brand.findUnique.mockResolvedValue({ merchantId: 'm-a', name: 'MOOR' });
  db.brand.findUniqueOrThrow.mockResolvedValue({ name: 'MOOR' });
  db.category.findUnique.mockResolvedValue({ id: 'c-1' });
  db.product.findUnique.mockResolvedValue(null);
  db.product.findFirst.mockResolvedValue(existing);
  db.product.create.mockResolvedValue({ id: 'p-new', slug: input.slug, name: input.name, status: 'ACTIVE' });
  db.product.update.mockImplementation(({ data }: { data: unknown }) => Promise.resolve({ id: 'p-1', ...(data as object) }));
  db.productSlug.findUnique.mockResolvedValue(null);
  db.productSlug.upsert.mockResolvedValue({});
  db.productSlug.deleteMany.mockResolvedValue({ count: 0 });
  db.productVariant.updateMany.mockResolvedValue({ count: 1 });
  /*
   * 인자로 함수가 오면 트랜잭션 안에서 실제로 돌린다. 배열이면 예전처럼
   * 목록으로 받는다 — 두 형태를 다 쓰고 있고, 흉내가 한쪽만 알면 검사가
   * 진짜와 다른 것을 본다.
   */
  db.$transaction.mockImplementation(async (arg: unknown) =>
    typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(db) : [],
  );
});

describe('상품 등록 — 브랜드 소유 검증', () => {
  it('자기 브랜드에는 등록할 수 있다', async () => {
    await expect(createProduct(merchantA, draftInput)).resolves.toMatchObject({ id: 'p-new' });
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
    await createProduct(admin, input);
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
    await updateProduct(admin, 'p-1', patch({ status: 'ACTIVE' }));
    expect(db.product.update.mock.calls[0]?.[0].data.publishedAt).toBeUndefined();
  });

  it('처음 공개할 때는 게시 시각을 찍는다', async () => {
    db.product.findFirst.mockResolvedValue({ ...existing, publishedAt: null, status: 'DRAFT' });
    await updateProduct(admin, 'p-1', patch({ status: 'ACTIVE' }));
    expect(db.product.update.mock.calls[0]?.[0].data.publishedAt).toBeInstanceOf(Date);
  });

  it('보내지 않은 필드는 건드리지 않는다', async () => {
    await updateProduct(merchantA, 'p-1', patch({ name: '바꾼 이름' }));
    // 계약을 통과한 입력이라도 관련 없는 필드는 실리지 않아야 한다.
    // searchText 는 이름에서 파생되므로 함께 바뀌는 것이 맞다.
    expect(Object.keys(db.product.update.mock.calls[0]?.[0].data).sort())
      .toEqual(['name', 'searchText']);
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
    // 읽은 값을 주지 않았으면 덮어쓴다 — 실사 결과를 그대로 넣는 경우다
    expect(db.productVariant.updateMany).toHaveBeenCalledWith({ where: { id: 'v-1' }, data: { stock: 12 } });
  });

  it('읽은 값을 주면 지금도 그 값일 때만 쓴다', async () => {
    db.productVariant.findMany.mockResolvedValue([{ id: 'v-1', sku: 'A-1', stock: 3 }]);

    await updateStock(merchantA, 'p-1', { variants: [{ variantId: 'v-1', stock: 12, expectedStock: 3 }] });

    expect(db.productVariant.updateMany).toHaveBeenCalledWith({ where: { id: 'v-1', stock: 3 }, data: { stock: 12 } });
  });

  it('그사이 재고가 바뀌었으면 쓰지 않고 알린다 — 읽은 뒤 팔린 수량을 지우지 않는다', async () => {
    db.productVariant.findMany.mockResolvedValue([{ id: 'v-1', sku: 'A-1', stock: 3 }]);
    db.productVariant.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      updateStock(merchantA, 'p-1', { variants: [{ variantId: 'v-1', stock: 12, expectedStock: 5 }] }),
    ).rejects.toMatchObject({ code: 'STOCK_CHANGED', status: 409 });
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

describe('파생 컬럼 — 정렬과 검색을 위해 저장하는 값', () => {
  beforeEach(() => {
    db.brand.findUnique.mockResolvedValue({ merchantId: 'm-a', name: 'MOOR' });
  });

  it('등록 시 판매가를 함께 저장한다', async () => {
    // Prisma 는 COALESCE 로 정렬할 수 없어 파생값을 컬럼으로 둔다
    await createProduct(merchantA, draftInput);
    expect(db.product.create.mock.calls[0]?.[0].data.sellingPrice).toBe(289_000);
  });

  it('할인이 없으면 정가가 판매가다', async () => {
    await createProduct(merchantA, { ...draftInput, salePrice: null });
    expect(db.product.create.mock.calls[0]?.[0].data.sellingPrice).toBe(413_000);
  });

  it('등록 시 검색 문자열을 소문자로 만든다', async () => {
    await createProduct(merchantA, { ...draftInput, name: '오트 코트' });
    expect(db.product.create.mock.calls[0]?.[0].data.searchText).toBe('오트 코트 moor');
  });

  it('정가만 바꿔도 판매가를 다시 계산한다', async () => {
    await updateProduct(merchantA, 'p-1', patch({ listPrice: 500_000 }));
    const data = db.product.update.mock.calls[0]?.[0].data;
    // 기존 salePrice(289,000) 가 유지되므로 판매가도 그대로여야 한다
    expect(data.sellingPrice).toBe(289_000);
    expect(data.listPrice).toBe(500_000);
  });

  it('할인을 없애면 판매가가 정가로 돌아간다', async () => {
    await updateProduct(merchantA, 'p-1', patch({ salePrice: null }));
    expect(db.product.update.mock.calls[0]?.[0].data.sellingPrice).toBe(413_000);
  });

  it('이름을 바꾸면 검색 문자열도 바꾼다', async () => {
    await updateProduct(merchantA, 'p-1', patch({ name: '새 이름' }));
    expect(db.product.update.mock.calls[0]?.[0].data.searchText).toBe('새 이름 moor');
  });

  it('이름도 브랜드도 그대로면 검색 문자열을 건드리지 않는다', async () => {
    await updateProduct(merchantA, 'p-1', patch({ status: 'HIDDEN' }));
    expect(db.product.update.mock.calls[0]?.[0].data.searchText).toBeUndefined();
  });

  it('가격을 안 바꾸면 판매가도 건드리지 않는다', async () => {
    await updateProduct(merchantA, 'p-1', patch({ name: '새 이름' }));
    expect(db.product.update.mock.calls[0]?.[0].data.sellingPrice).toBeUndefined();
  });
});

describe('게시 권한', () => {
  it('가맹점은 상품을 곧바로 매대에 올릴 수 없다', async () => {
    /*
     * product:publish 는 권한 표에만 있고 어디서도 검사하지 않았다. 게다가
     * 가맹점도 그 권한을 갖고 있어서, 검사를 넣어도 아무것도 달라지지
     * 않았다 — 구분하지 않는 권한은 없는 권한과 같다.
     */
    await expect(createProduct(merchantA, input)).rejects.toMatchObject({
      code: 'PUBLISH_NOT_ALLOWED', status: 403,
    });
    expect(db.product.create).not.toHaveBeenCalled();
  });

  it('품절도 매대에 보이는 상태라 막는다', async () => {
    await expect(
      createProduct(merchantA, { ...input, status: 'SOLD_OUT' }),
    ).rejects.toMatchObject({ code: 'PUBLISH_NOT_ALLOWED' });
  });

  it('검수 대기로는 등록할 수 있다 — 요청할 길은 열어 둔다', async () => {
    await createProduct(merchantA, { ...input, status: 'PENDING_REVIEW' });

    const data = db.product.create.mock.calls[0]![0].data;
    expect(data.status).toBe('PENDING_REVIEW');
    // 매대에 보이지 않으므로 게시 시각은 찍지 않는다
    expect(data.publishedAt).toBeNull();
    expect(data.reviewRequestedAt).toBeInstanceOf(Date);
  });

  it('검수 대기로 저장해도 게시 도장이 찍히지 않는다', async () => {
    /*
     * "DRAFT 가 아니면 찍는다" 로 두면 여기서 publishedAt 이 생기고, 그러면
     * 검수를 통과한 상품으로 보여서 가맹점이 스스로 판매중으로 올릴 수 있다.
     */
    db.product.findFirst.mockResolvedValue({ ...existing, publishedAt: null });
    await updateProduct(merchantA, 'p-1', patch({ status: 'PENDING_REVIEW' }));

    expect(db.product.update.mock.calls[0]![0].data.publishedAt).toBeUndefined();
  });

  it('숨김으로 내리는 것은 막지 않는다', async () => {
    // 자기 상품을 못 내리면 곤란하다. 내리는 것은 매대에 올리는 것이 아니다.
    db.product.findFirst.mockResolvedValue({ ...existing, publishedAt: null });
    await expect(
      updateProduct(merchantA, 'p-1', patch({ status: 'HIDDEN' })),
    ).resolves.toBeDefined();
  });

  it('한 번 게시된 상품은 가맹점이 다시 올릴 수 있다', async () => {
    /*
     * 심사는 최초 한 번이다. 매번 막으면 품절 처리나 사진 교체 때마다
     * 운영진을 기다려야 한다 — 검수가 아니라 발목이다.
     */
    db.product.findFirst.mockResolvedValue({ ...existing, publishedAt: new Date('2026-01-01') });

    await expect(
      updateProduct(merchantA, 'p-1', patch({ status: 'ACTIVE' })),
    ).resolves.toBeDefined();
  });

  it('운영진은 곧바로 올릴 수 있다', async () => {
    await expect(createProduct(admin, input)).resolves.toBeDefined();
  });
});

describe('게시 검수 처리', () => {
  beforeEach(() => {
    db.product.findFirst.mockResolvedValue({
      id: 'p-1', name: '오트 코트', status: 'PENDING_REVIEW', publishedAt: null,
    });
    db.product.update.mockResolvedValue({
      id: 'p-1', name: '오트 코트', status: 'ACTIVE', publishRejection: null,
    });
  });

  it('가맹점은 검수를 처리할 수 없다', async () => {
    await expect(reviewProduct(merchantA, 'p-1', { approve: true })).rejects.toMatchObject({
      code: 'PUBLISH_NOT_ALLOWED', status: 403,
    });
  });

  it('승인하면 판매중으로 올리고 게시 시각을 찍는다', async () => {
    await reviewProduct(admin, 'p-1', { approve: true });

    const data = db.product.update.mock.calls[0]![0].data;
    expect(data.status).toBe('ACTIVE');
    expect(data.publishedAt).toBeInstanceOf(Date);
    expect(data.reviewRequestedAt).toBeNull();
  });

  it('이미 게시된 적이 있으면 시각을 덮어쓰지 않는다', async () => {
    // 덮어쓰면 "신상품" 판정이 되살아난다
    db.product.findFirst.mockResolvedValue({
      id: 'p-1', name: '오트 코트', status: 'PENDING_REVIEW', publishedAt: new Date('2026-01-01'),
    });

    await reviewProduct(admin, 'p-1', { approve: true });

    expect(db.product.update.mock.calls[0]![0].data.publishedAt).toBeUndefined();
  });

  it('반려에는 사유가 있어야 한다', async () => {
    // 이유 없이 되돌리면 가맹점은 무엇을 고쳐야 할지 모른다
    await expect(
      reviewProduct(admin, 'p-1', { approve: false, reason: '   ' }),
    ).rejects.toMatchObject({ code: 'REJECT_REASON_REQUIRED', status: 400 });
    expect(db.product.update).not.toHaveBeenCalled();
  });

  it('반려하면 작성 중으로 되돌리고 사유를 남긴다', async () => {
    await reviewProduct(admin, 'p-1', { approve: false, reason: '사진이 흐립니다' });

    const data = db.product.update.mock.calls[0]![0].data;
    expect(data.status).toBe('DRAFT');
    expect(data.publishRejection).toBe('사진이 흐립니다');
  });

  it('승인하면 올린 쪽에 알린다 — 안 알리면 며칠째 대기줄인 줄 안다', async () => {
    await reviewProduct(admin, 'p-1', { approve: true });

    expect(notifyProductReviewed).toHaveBeenCalledWith(
      expect.objectContaining({ productId: 'p-1', approved: true }),
    );
  });

  it('반려하면 사유를 실어 알린다', async () => {
    /*
     * **사유는 진작 받고 있었는데 닿지 않았다.** 상품 행에 적어 두기만 해서,
     * 가맹점은 자기 상품을 다시 열어 봐야 그것을 봤다. 검수는 며칠 걸리는
     * 일이라 다시 열어 볼 이유가 없다.
     */
    await reviewProduct(admin, 'p-1', { approve: false, reason: '사진이 흐립니다' });

    expect(notifyProductReviewed).toHaveBeenCalledWith(
      expect.objectContaining({ approved: false, reason: '사진이 흐립니다' }),
    );
  });

  it('처리하지 못한 검수는 알리지 않는다', async () => {
    // 대기줄에 없는 상품 — 아무 일도 일어나지 않았는데 알림이 가면 안 된다
    db.product.findFirst.mockResolvedValue({
      id: 'p-1', name: '오트 코트', status: 'ACTIVE', publishedAt: new Date(),
    });

    await expect(reviewProduct(admin, 'p-1', { approve: true })).rejects.toThrow();
    expect(notifyProductReviewed).not.toHaveBeenCalled();
  });

  it('사유 없는 반려도 알리지 않는다', async () => {
    await expect(
      reviewProduct(admin, 'p-1', { approve: false, reason: '  ' }),
    ).rejects.toThrow();
    expect(notifyProductReviewed).not.toHaveBeenCalled();
  });

  it('대기줄에 없는 상품은 처리하지 않는다', async () => {
    // 다른 운영자가 이미 본 것을 두 번 처리하게 된다
    db.product.findFirst.mockResolvedValue({
      id: 'p-1', name: '오트 코트', status: 'ACTIVE', publishedAt: new Date(),
    });

    await expect(reviewProduct(admin, 'p-1', { approve: true })).rejects.toMatchObject({
      code: 'NOT_AWAITING_REVIEW', status: 409,
    });
  });

  it('다시 요청하면 지난 반려 사유를 지운다', async () => {
    // 고쳐서 다시 올린 상품에 옛 사유가 붙어 있으면 지금 상태인 줄 안다
    db.product.findFirst.mockResolvedValue({
      ...existing, publishedAt: null, publishRejection: '사진이 흐립니다',
    });

    await updateProduct(merchantA, 'p-1', patch({ status: 'PENDING_REVIEW' }));

    expect(db.product.update.mock.calls[0]![0].data.publishRejection).toBeNull();
  });
});
