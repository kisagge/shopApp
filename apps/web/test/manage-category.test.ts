import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';
import { createCategorySchema, updateCategorySchema } from '@shop/contract';

const tx = vi.hoisted(() => ({
  category: { update: vi.fn<(...a: any[]) => any>() },
  categorySlug: { upsert: vi.fn<(...a: any[]) => any>() },
}));
const db = vi.hoisted(() => ({
  category: {
    findMany: vi.fn<(...a: any[]) => any>(),
    findUnique: vi.fn<(...a: any[]) => any>(),
    findFirst: vi.fn<(...a: any[]) => any>(),
    create: vi.fn<(...a: any[]) => any>(),
    update: vi.fn<(...a: any[]) => any>(),
    delete: vi.fn<(...a: any[]) => any>(),
  },
  categorySlug: { findUnique: vi.fn<(...a: any[]) => any>() },
  $transaction: vi.fn<(...a: any[]) => any>(),
}));
vi.mock('@shop/db', () => ({ prisma: db, Prisma: { PrismaClientKnownRequestError: class {} } }));

const { getCategoryTree, createCategory, updateCategory, reorderCategories, deleteCategory } =
  await import('~/lib/admin/manage-category');

/**
 * 카테고리 관리.
 *
 * **바꿀 창구가 없었다.** 시즌마다 갈래를 더하려면 DB 콘솔을 열어야 했고, 머리
 * 메뉴의 순서도 시드만 썼다.
 */

const admin: Actor = { id: 'u-a', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };

const row = (over: Record<string, unknown> = {}) => ({
  id: 'c-1', name: '아우터', slug: 'outer', sortOrder: 0, parentId: null,
  _count: { products: 0, children: 0 },
  ...over,
});

const create = (raw: unknown) => createCategorySchema.parse(raw);
const update = (raw: unknown) => updateCategorySchema.parse(raw);

beforeEach(() => {
  vi.clearAllMocks();
  db.category.findMany.mockResolvedValue([]);
  db.category.findUnique.mockResolvedValue(null);
  db.category.findFirst.mockResolvedValue(null);
  db.categorySlug.findUnique.mockResolvedValue(null);
  db.$transaction.mockImplementation((arg: unknown) =>
    typeof arg === 'function' ? (arg as (t: typeof tx) => unknown)(tx) : Promise.resolve([]));
});

describe('가맹점에게는 닫혀 있다', () => {
  it.each([
    ['읽기', () => getCategoryTree(merchant)],
    ['만들기', () => createCategory(merchant, create({ name: '새 갈래', slug: 'new-one' }))],
    ['고치기', () => updateCategory(merchant, 'c-1', update({ name: '바꿈' }))],
    ['순서', () => reorderCategories(merchant, null, ['c-1'])],
    ['지우기', () => deleteCategory(merchant, 'c-1')],
  ])('%s', async (_label, run) => {
    // 카테고리는 매대 전체의 갈래라 누구의 것도 아니다
    await expect(run()).rejects.toMatchObject({ status: 403 });
  });
});

describe('나무 만들기', () => {
  it('부모 밑에 자식을 건다', async () => {
    db.category.findMany.mockResolvedValue([
      row({ id: 'c-top', name: '아우터', parentId: null }),
      row({ id: 'c-kid', name: '코트', parentId: 'c-top', _count: { products: 8, children: 0 } }),
    ]);

    const tree = await getCategoryTree(admin);

    expect(tree).toHaveLength(1);
    expect(tree[0]!.children.map((c) => c.name)).toEqual(['코트']);
  });

  it('상품 수는 자기 것만 센다 — 상위의 합계는 화면이 더한다', async () => {
    db.category.findMany.mockResolvedValue([
      row({ id: 'c-top', parentId: null, _count: { products: 0, children: 1 } }),
      row({ id: 'c-kid', parentId: 'c-top', _count: { products: 8, children: 0 } }),
    ]);

    const tree = await getCategoryTree(admin);

    expect(tree[0]!.productCount).toBe(0);
    expect(tree[0]!.children[0]!.productCount).toBe(8);
  });

  it('보관한 상품은 세지 않는다', async () => {
    await getCategoryTree(admin);
    expect(db.category.findMany.mock.calls[0]![0].select._count.select.products).toEqual({
      where: { deletedAt: null },
    });
  });

  it('지울 수 있는지 함께 말한다', async () => {
    db.category.findMany.mockResolvedValue([
      row({ id: 'c-empty', parentId: null, _count: { products: 0, children: 0 } }),
      row({ id: 'c-full', parentId: null, _count: { products: 3, children: 0 } }),
    ]);

    expect((await getCategoryTree(admin)).map((c) => c.deletable)).toEqual([true, false]);
  });
});

describe('만들기', () => {
  it('맨 뒤에 놓는다 — 가운데로 밀면 정해 둔 메뉴 순서가 흔들린다', async () => {
    db.category.findFirst.mockResolvedValue({ sortOrder: 4 });

    await createCategory(admin, create({ name: '신상', slug: 'new-in' }));

    expect(db.category.create.mock.calls[0]![0].data.sortOrder).toBe(5);
  });

  it('형제가 없으면 0 이다', async () => {
    await createCategory(admin, create({ name: '첫 갈래', slug: 'first' }));
    expect(db.category.create.mock.calls[0]![0].data.sortOrder).toBe(0);
  });

  it('손자는 못 만든다', async () => {
    db.category.findUnique.mockImplementation(async (args?: { where?: { id?: string } }) =>
      args?.where?.id === 'c-kid'
        ? { id: 'c-kid', parentId: 'c-top', _count: { products: 0 } }
        : null);

    await expect(
      createCategory(admin, create({ name: '손자', slug: 'grand', parentId: 'c-kid' })),
    ).rejects.toMatchObject({ code: 'TOO_DEEP', status: 409 });
    expect(db.category.create).not.toHaveBeenCalled();
  });

  it('상품이 붙은 갈래 밑에는 못 만든다', async () => {
    db.category.findUnique.mockImplementation(async (args?: { where?: { id?: string } }) =>
      args?.where?.id === 'c-shoes'
        ? { id: 'c-shoes', parentId: null, _count: { products: 4 } }
        : null);

    await expect(
      createCategory(admin, create({ name: '운동화', slug: 'sneakers', parentId: 'c-shoes' })),
    ).rejects.toMatchObject({ code: 'PARENT_HAS_PRODUCTS' });
  });

  it('이미 쓰는 주소로는 못 만든다', async () => {
    db.category.findUnique.mockResolvedValue({ id: 'c-2' });

    await expect(
      createCategory(admin, create({ name: '겹침', slug: 'outer' })),
    ).rejects.toMatchObject({ code: 'SLUG_TAKEN' });
  });
});

describe('주소 바꾸기', () => {
  beforeEach(() => db.category.findUnique.mockResolvedValue({ id: 'c-1', slug: 'outer' }));

  it('옛 주소를 기록에 남긴다', async () => {
    await updateCategory(admin, 'c-1', update({ slug: 'outerwear' }));

    expect(tx.categorySlug.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: 'outer' } }),
    );
  });

  it('이름만 바꾸면 기록을 남기지 않는다', async () => {
    await updateCategory(admin, 'c-1', update({ name: '겉옷' }));
    expect(tx.categorySlug.upsert).not.toHaveBeenCalled();
  });

  it('자기가 버린 주소는 다시 쓸 수 있다', async () => {
    db.categorySlug.findUnique.mockResolvedValue({ categoryId: 'c-1' });
    await expect(updateCategory(admin, 'c-1', update({ slug: 'old' }))).resolves.toBeTruthy();
  });

  it('남이 버리고 간 주소는 못 가져간다', async () => {
    db.categorySlug.findUnique.mockResolvedValue({ categoryId: 'c-2' });
    await expect(
      updateCategory(admin, 'c-1', update({ slug: 'old' })),
    ).rejects.toMatchObject({ code: 'SLUG_TAKEN' });
  });
});

describe('순서 바꾸기', () => {
  it('그 부모의 자식 전부를 받아야 한다', async () => {
    /*
     * 일부만 받으면 나머지의 자리가 어디인지 알 수 없어서, 다시 매길 때
     * 조용히 앞으로 끌려 나온다.
     */
    db.category.findMany.mockResolvedValue([{ id: 'c-1' }, { id: 'c-2' }, { id: 'c-3' }]);

    await expect(
      reorderCategories(admin, 'c-top', ['c-1', 'c-2']),
    ).rejects.toMatchObject({ code: 'CATEGORY_NOT_FOUND', status: 404 });
  });

  it('남의 자식은 못 섞어 넣는다', async () => {
    db.category.findMany.mockResolvedValue([{ id: 'c-1' }, { id: 'c-2' }]);

    await expect(
      reorderCategories(admin, 'c-top', ['c-1', 'c-9']),
    ).rejects.toMatchObject({ code: 'CATEGORY_NOT_FOUND' });
  });

  it('받은 차례대로 0부터 다시 매긴다', async () => {
    db.category.findMany.mockResolvedValue([{ id: 'c-1' }, { id: 'c-2' }]);

    await reorderCategories(admin, 'c-top', ['c-2', 'c-1']);

    const written = db.category.update.mock.calls.map((c) => [c[0].where.id, c[0].data.sortOrder]);
    expect(written).toEqual([['c-2', 0], ['c-1', 1]]);
  });
});

describe('지우기', () => {
  it('비어 있으면 지운다', async () => {
    db.category.findUnique.mockResolvedValue({ _count: { products: 0, children: 0 } });

    await deleteCategory(admin, 'c-1');

    expect(db.category.delete).toHaveBeenCalledWith({ where: { id: 'c-1' } });
  });

  it('상품이 있으면 막는다 — 그 상품들이 갈 곳을 잃는다', async () => {
    db.category.findUnique.mockResolvedValue({ _count: { products: 3, children: 0 } });

    await expect(deleteCategory(admin, 'c-1')).rejects.toMatchObject({
      code: 'CATEGORY_NOT_EMPTY', status: 409,
    });
    expect(db.category.delete).not.toHaveBeenCalled();
  });

  it('자식이 있으면 막는다 — 그 갈래가 통째로 사라진다', async () => {
    db.category.findUnique.mockResolvedValue({ _count: { products: 0, children: 2 } });

    await expect(deleteCategory(admin, 'c-1')).rejects.toMatchObject({
      code: 'CATEGORY_NOT_EMPTY',
    });
  });
});
