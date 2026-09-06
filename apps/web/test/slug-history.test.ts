import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';
import { updateProductSchema, createProductSchema } from '@shop/contract';

/**
 * 주소가 이름 변경에서 살아남는가.
 *
 * slug 는 운영자가 고칠 수 있는 자유 입력칸이다. 고치는 순간 그때까지 나간
 * 링크가 전부 죽는데 **화면에는 멀쩡한 404 가 나온다** — 아무도 사고인 줄
 * 모른다. 공유된 메시지도, 검색엔진 색인도, 광고 소재도 함께 죽는다.
 */

const db = vi.hoisted(() => ({
  brand: {
    findUnique: vi.fn<(...a: any[]) => any>(),
    findUniqueOrThrow: vi.fn<(...a: any[]) => any>(),
  },
  category: { findUnique: vi.fn<(...a: any[]) => any>() },
  product: {
    findUnique: vi.fn<(...a: any[]) => any>(),
    findFirst: vi.fn<(...a: any[]) => any>(),
    create: vi.fn<(...a: any[]) => any>(),
    update: vi.fn<(...a: any[]) => any>(),
  },
  productSlug: {
    findUnique: vi.fn<(...a: any[]) => any>(),
    upsert: vi.fn<(...a: any[]) => any>(),
    deleteMany: vi.fn<(...a: any[]) => any>(),
  },
  $transaction: vi.fn<(...a: any[]) => any>(),
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const { createProduct, updateProduct } = await import('~/lib/admin/manage-product');

const admin: Actor = { id: 'u-admin', role: 'ADMIN', merchantId: null };

const existing = {
  id: 'p-1', slug: 'oat-coat', name: '오트 코트', description: '',
  listPrice: 413_000, salePrice: 289_000, status: 'ACTIVE',
  brandId: 'clh1abc2300000000000000000', categoryId: 'clh1abc2300000000000000001',
  publishedAt: new Date('2026-01-01'),
  brand: { merchantId: null },
};

beforeEach(() => {
  vi.clearAllMocks();
  db.brand.findUnique.mockResolvedValue({ merchantId: null, name: 'MOOR' });
  db.brand.findUniqueOrThrow.mockResolvedValue({ name: 'MOOR' });
  db.category.findUnique.mockResolvedValue({ id: 'c-1' });
  db.product.findUnique.mockResolvedValue(null);
  db.product.findFirst.mockResolvedValue(existing);
  db.product.create.mockResolvedValue({ id: 'p-9', slug: 'x', name: 'x', status: 'DRAFT' });
  db.product.update.mockResolvedValue({ ...existing, slug: 'wool-coat' });
  db.productSlug.findUnique.mockResolvedValue(null);
  db.productSlug.upsert.mockResolvedValue({});
  db.productSlug.deleteMany.mockResolvedValue({ count: 0 });
  db.$transaction.mockImplementation(async (arg: unknown) =>
    typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(db) : [],
  );
});

const patch = (raw: unknown) => updateProductSchema.parse(raw);

describe('이름을 바꾸면 옛 주소가 남는다', () => {
  it('옛 주소를 기록한다', async () => {
    await updateProduct(admin, 'p-1', patch({ slug: 'wool-coat' }));

    expect(db.productSlug.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { slug: 'oat-coat' },
        create: { slug: 'oat-coat', productId: 'p-1' },
      }),
    );
  });

  /**
   * a → b → a 로 돌아온 경우. a 를 기록에 남겨 두면 **자기 자신으로 넘기는
   * 고리**가 된다 — 브라우저가 무한 리다이렉트로 멈춘다.
   */
  it('되돌아온 주소는 기록에서 지운다', async () => {
    await updateProduct(admin, 'p-1', patch({ slug: 'wool-coat' }));

    expect(db.productSlug.deleteMany).toHaveBeenCalledWith({ where: { slug: 'wool-coat' } });
  });

  it('이름을 안 바꾸면 아무것도 기록하지 않는다', async () => {
    await updateProduct(admin, 'p-1', patch({ name: '오트 코트 II' }));

    expect(db.productSlug.upsert).not.toHaveBeenCalled();
  });

  /**
   * **기록과 수정은 함께 일어나야 한다.** 따로 두면 하나만 성공했을 때
   * 링크가 죽거나(기록 실패), 살아 있는 주소가 옛 주소로 기록된다(수정 실패).
   */
  it('기록과 수정이 한 트랜잭션이다', async () => {
    await updateProduct(admin, 'p-1', patch({ slug: 'wool-coat' }));

    expect(db.$transaction).toHaveBeenCalledOnce();
    expect(typeof db.$transaction.mock.calls[0]![0]).toBe('function');
  });
});

describe('버리고 간 주소를 남이 집어 가지 못한다', () => {
  it('기록에 남은 주소로는 새 상품을 만들 수 없다', async () => {
    db.productSlug.findUnique.mockResolvedValue({ productId: 'p-1' });

    await expect(
      createProduct(
        admin,
        createProductSchema.parse({
          slug: 'oat-coat', name: '다른 코트',
          brandId: 'clh1abc2300000000000000000', categoryId: 'clh1abc2300000000000000001',
          listPrice: 100_000, status: 'DRAFT',
        }),
      ),
    ).rejects.toMatchObject({ code: 'SLUG_TAKEN' });
  });

  it('남이 버린 주소로는 이름을 바꿀 수 없다', async () => {
    db.productSlug.findUnique.mockResolvedValue({ productId: 'p-other' });

    await expect(updateProduct(admin, 'p-1', patch({ slug: 'taken-once' }))).rejects.toMatchObject({
      code: 'SLUG_TAKEN',
    });
  });

  it('자기가 버린 주소로는 되돌아갈 수 있다', async () => {
    db.productSlug.findUnique.mockResolvedValue({ productId: 'p-1' });

    await expect(updateProduct(admin, 'p-1', patch({ slug: 'was-mine' }))).resolves.toBeDefined();
  });
});
