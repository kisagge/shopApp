import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenError, searchTextFor, type Actor } from '@shop/core';
import { createBrandSchema, updateBrandSchema } from '@shop/contract';

const tx = vi.hoisted(() => ({
  brand: { update: vi.fn<(...a: any[]) => any>() },
  brandSlug: { upsert: vi.fn<(...a: any[]) => any>() },
  product: { findMany: vi.fn<(...a: any[]) => any>() },
  // 태그 템플릿으로 불린다 — 조각과 값을 그대로 받아 둔다
  $executeRaw: vi.fn<(...a: any[]) => any>(),
}));
const db = vi.hoisted(() => ({
  brand: {
    findMany: vi.fn<(...a: any[]) => any>(),
    findUnique: vi.fn<(...a: any[]) => any>(),
    create: vi.fn<(...a: any[]) => any>(),
  },
  brandSlug: { findUnique: vi.fn<(...a: any[]) => any>() },
  $transaction: vi.fn<(...a: any[]) => any>(),
}));
vi.mock('@shop/db', () => ({
  prisma: db,
  Prisma: {
    PrismaClientKnownRequestError: class {},
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings: [...strings], values }),
    join: (items: unknown[]) => ({ joined: items }),
  },
}));

const { listBrands, createBrand, updateBrand, getBrandSlugMovedTo } =
  await import('~/lib/admin/manage-brand');

/**
 * 브랜드 관리.
 *
 * **시드 말고는 브랜드를 쓰는 곳이 없었다.** 입점 승인 때 자동으로 만들어진
 * 브랜드는 만들어진 그대로 굳었고, 한글 이름이면 주소가 `brand-a1b2c3d4` 였다.
 */

const admin: Actor = { id: 'u-a', role: 'ADMIN', merchantId: null };
const merchantA: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };
const customer: Actor = { id: 'u-c', role: 'CUSTOMER', merchantId: null };

const brandRow = (over: Record<string, unknown> = {}) => ({
  id: 'b-1', name: 'MOOR', slug: 'moor', merchantId: 'm-a',
  merchant: { name: '무어' },
  _count: { products: 12 },
  ...over,
});

const update = (raw: unknown) => updateBrandSchema.parse(raw);

beforeEach(() => {
  vi.clearAllMocks();
  db.brand.findMany.mockResolvedValue([]);
  db.brand.findUnique.mockResolvedValue(null);
  db.brandSlug.findUnique.mockResolvedValue(null);
  db.$transaction.mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx));
  tx.brand.update.mockResolvedValue({ id: 'b-1', name: 'MOOR', slug: 'moor-seoul' });
  tx.product.findMany.mockResolvedValue([]);
  tx.$executeRaw.mockResolvedValue(0);
});

describe('누가 보는가', () => {
  it('고객은 볼 수 없다', async () => {
    await expect(listBrands(customer)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('가맹점은 자기 브랜드만 본다 — 남의 간판은 볼 일이 없다', async () => {
    await listBrands(merchantA);
    expect(db.brand.findMany.mock.calls[0]![0].where).toEqual({ merchantId: 'm-a' });
  });

  it('운영진에게는 좁히는 조건이 붙지 않는다', async () => {
    await listBrands(admin);
    expect(db.brand.findMany.mock.calls[0]![0].where).toEqual({});
  });

  it('자동으로 지어진 주소를 짚어 준다 — 고치라고 만든 화면이다', async () => {
    db.brand.findMany.mockResolvedValue([
      { ...brandRow({ slug: 'brand-a1b2c3d4' }) },
      { ...brandRow({ id: 'b-2', slug: 'studio-noon' }) },
    ]);

    const rows = await listBrands(admin);

    expect(rows.map((r) => r.slugIsGenerated)).toEqual([true, false]);
  });

  it('보관한 상품은 세지 않는다', async () => {
    await listBrands(admin);
    expect(db.brand.findMany.mock.calls[0]![0].select._count.select.products).toEqual({
      where: { deletedAt: null },
    });
  });
});

describe('주소 바꾸기', () => {
  beforeEach(() => db.brand.findUnique.mockResolvedValue(brandRow()));

  it('옛 주소를 기록에 남긴다 — 안 남기면 그때까지 나간 링크가 죽는다', async () => {
    await updateBrand(admin, 'b-1', update({ slug: 'moor-seoul' }));

    expect(tx.brandSlug.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: 'moor' } }),
    );
  });

  it('같은 트랜잭션 안에서 함께 한다', async () => {
    /*
     * 따로 하면 기록만 남고 주소는 그대로이거나 그 반대가 된다. 둘 다 조용히
     * 잘못되고, 화면에는 멀쩡한 404 가 나온다.
     */
    await updateBrand(admin, 'b-1', update({ slug: 'moor-seoul' }));

    expect(db.$transaction).toHaveBeenCalledOnce();
  });

  it('주소를 안 바꾸면 기록을 남기지 않는다', async () => {
    await updateBrand(admin, 'b-1', update({ name: '무어 서울' }));

    expect(tx.brandSlug.upsert).not.toHaveBeenCalled();
  });

  it('같은 주소로 저장해도 기록을 남기지 않는다 — 자기 자신으로 넘기게 된다', async () => {
    await updateBrand(admin, 'b-1', update({ slug: 'moor' }));

    expect(tx.brandSlug.upsert).not.toHaveBeenCalled();
  });

  it('남이 쓰는 주소는 못 가져간다', async () => {
    db.brand.findUnique.mockImplementation(async (args?: { where?: { slug?: string } }) =>
      // slug 로 찾는 것은 주소가 비었는지 보는 조회다(slugTaken), id 로 찾는 것은 대상이다
      args?.where?.slug === 'studio-noon' ? { id: 'b-2' } : brandRow());

    await expect(
      updateBrand(admin, 'b-1', update({ slug: 'studio-noon' })),
    ).rejects.toMatchObject({ code: 'SLUG_TAKEN', status: 409 });
  });

  it('남이 버리고 간 주소도 못 가져간다', async () => {
    /*
     * 그 주소가 한쪽에서는 새 주인을 가리키고 다른 쪽에서는 옛 주인으로 넘긴다.
     * 판단은 core 가 한다(isSlugTaken).
     */
    db.brandSlug.findUnique.mockResolvedValue({ brandId: 'b-2' });

    await expect(
      updateBrand(admin, 'b-1', update({ slug: 'old-name' })),
    ).rejects.toMatchObject({ code: 'SLUG_TAKEN' });
  });

  it('자기가 버린 주소는 다시 쓸 수 있다 — 고쳤다 되돌리는 것은 흔한 일이다', async () => {
    db.brandSlug.findUnique.mockResolvedValue({ brandId: 'b-1' });

    await expect(
      updateBrand(admin, 'b-1', update({ slug: 'old-name' })),
    ).resolves.toBeTruthy();
  });
});

describe('이름 바꾸기 — 상품 검색 문자열', () => {
  /*
   * 상품 검색은 상품 행에 복사해 둔 "상품명 + 브랜드명" 을 본다. 이름을 바꾸는 화면을 만들면서 그
   * 복사본을 고치지 않아, 새 이름으로 검색하면 그 브랜드 상품이 하나도 안 나왔다.
   */
  beforeEach(() => {
    db.brand.findUnique.mockResolvedValue(brandRow());
    tx.brand.update.mockResolvedValue({ id: 'b-1', name: 'MOOR SEOUL', slug: 'moor' });
    tx.product.findMany.mockResolvedValue([
      { id: 'p-1', name: '울 코트' },
      { id: 'p-2', name: 'Wide Slacks' },
    ]);
  });

  /** $executeRaw 에 넘어간 VALUES 줄들 — (id, 읽은 상품명, 새 검색 문자열) */
  const writtenRows = () => {
    const values = tx.$executeRaw.mock.calls[0]!.slice(1) as unknown[];
    const joined = values.find((v): v is { joined: { values: unknown[] }[] } =>
      typeof v === 'object' && v !== null && 'joined' in v);
    return joined!.joined.map((row) => row.values);
  };

  it('그 브랜드 상품마다 새 이름으로 검색 문자열을 다시 적는다 — 규칙은 core 의 것', async () => {
    await updateBrand(admin, 'b-1', update({ name: 'MOOR SEOUL' }));

    expect(tx.product.findMany).toHaveBeenCalledWith({ where: { brandId: 'b-1' }, select: { id: true, name: true } });
    expect(writtenRows()).toEqual([
      ['p-1', '울 코트', searchTextFor({ name: '울 코트', brandName: 'MOOR SEOUL' })],
      ['p-2', 'Wide Slacks', searchTextFor({ name: 'Wide Slacks', brandName: 'MOOR SEOUL' })],
    ]);
  });

  it('한 문장으로 쓰고, 그사이 상품 이름이 바뀐 줄은 건드리지 않는다', async () => {
    await updateBrand(admin, 'b-1', update({ name: 'MOOR SEOUL' }));

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    const sql = (tx.$executeRaw.mock.calls[0]![0] as string[]).join('?');
    expect(sql).toMatch(/p\.name = v\.name/);
    expect(sql).toMatch(/p\."brandId" = /);
  });

  it('주소만 바꾸면 검색 문자열을 건드리지 않는다', async () => {
    tx.brand.update.mockResolvedValue({ id: 'b-1', name: 'MOOR', slug: 'moor-seoul' });

    await updateBrand(admin, 'b-1', update({ slug: 'moor-seoul' }));

    expect(tx.product.findMany).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('상품이 없는 브랜드면 쓸 것이 없다', async () => {
    tx.product.findMany.mockResolvedValue([]);

    await updateBrand(admin, 'b-1', update({ name: 'MOOR SEOUL' }));

    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
});

describe('범위', () => {
  it('가맹점은 남의 브랜드를 못 고친다', async () => {
    db.brand.findUnique.mockResolvedValue(brandRow({ merchantId: 'm-b' }));

    await expect(
      updateBrand(merchantA, 'b-1', update({ name: '가로채기' })),
    ).rejects.toMatchObject({ code: 'BRAND_NOT_ALLOWED', status: 403 });
  });

  it('가맹점은 자사 브랜드도 못 고친다', async () => {
    db.brand.findUnique.mockResolvedValue(brandRow({ merchantId: null, merchant: null }));

    await expect(
      updateBrand(merchantA, 'b-1', update({ name: '가로채기' })),
    ).rejects.toMatchObject({ code: 'BRAND_NOT_ALLOWED' });
  });

  it('없는 브랜드는 못 찾았다고 한다', async () => {
    db.brand.findUnique.mockResolvedValue(null);

    await expect(
      updateBrand(admin, 'b-x', update({ name: '아무거나' })),
    ).rejects.toMatchObject({ code: 'BRAND_NOT_FOUND', status: 404 });
  });
});

describe('만들기', () => {
  it('가맹점에게는 닫혀 있다', async () => {
    await expect(
      createBrand(merchantA, createBrandSchema.parse({ name: '둘째 간판', slug: 'second' })),
    ).rejects.toMatchObject({ code: 'BRAND_NOT_ALLOWED', status: 403 });
    expect(db.brand.create).not.toHaveBeenCalled();
  });

  it('운영진이 만드는 것은 자사 브랜드다 — 가맹점은 붙이지 않는다', async () => {
    db.brand.create.mockResolvedValue({ id: 'b-9', name: 'PLAIN LABEL', slug: 'plain-label' });

    await createBrand(admin, createBrandSchema.parse({ name: 'PLAIN LABEL', slug: 'plain-label' }));

    expect(db.brand.create.mock.calls[0]![0].data).toEqual({
      name: 'PLAIN LABEL', slug: 'plain-label',
    });
  });

  it('이미 쓰는 주소로는 못 만든다', async () => {
    db.brand.findUnique.mockResolvedValue({ id: 'b-2' });

    await expect(
      createBrand(admin, createBrandSchema.parse({ name: '겹침', slug: 'moor' })),
    ).rejects.toMatchObject({ code: 'SLUG_TAKEN' });
  });
});

describe('옛 주소가 가리키는 곳', () => {
  it('지금 주소를 돌려준다', async () => {
    db.brandSlug.findUnique.mockResolvedValue({ brand: { slug: 'moor-seoul' } });
    expect(await getBrandSlugMovedTo('moor')).toBe('moor-seoul');
  });

  it('쓴 적 없는 주소는 null 이다', async () => {
    expect(await getBrandSlugMovedTo('never-used')).toBeNull();
  });
});
