import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

const db = vi.hoisted(() => ({
  collection: {
    findMany: vi.fn<(...a: any[]) => any>(), findUnique: vi.fn<(...a: any[]) => any>(),
    findUniqueOrThrow: vi.fn<(...a: any[]) => any>(),
    create: vi.fn<(...a: any[]) => any>(), update: vi.fn<(...a: any[]) => any>(),
    delete: vi.fn<(...a: any[]) => any>(), count: vi.fn<(...a: any[]) => any>(),
  },
  collectionItem: {
    findMany: vi.fn<(...a: any[]) => any>(),
    deleteMany: vi.fn<(...a: any[]) => any>(),
    createMany: vi.fn<(...a: any[]) => any>(),
  },
  product: { count: vi.fn<(...a: any[]) => any>() },
  $transaction: vi.fn<(...a: any[]) => any>(),
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const {
  getAdminCollections, getCollectionItems, createCollection, updateCollection,
  setCollectionItems, deleteCollection, CollectionError,
} = await import('~/lib/admin/manage-collection');

const admin: Actor = { id: 'u-a', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };
const customer: Actor = { id: 'u-c', role: 'CUSTOMER', merchantId: null };

const NOW = new Date('2026-09-01T12:00:00Z');

const row = (over: Record<string, unknown> = {}) => ({
  id: 'c-1', slug: 'winter-outer', title: '겨울', subtitle: null, description: null,
  imageUrl: null, imageAlt: null, tone: 'sand', sortOrder: 0,
  isActive: true, startsAt: null, endsAt: null, _count: { items: 3 },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.collection.findMany.mockResolvedValue([]);
  db.collection.findUnique.mockResolvedValue(null);
  db.collection.count.mockResolvedValue(0);
  db.collectionItem.findMany.mockResolvedValue([]);
  db.product.count.mockResolvedValue(0);
  db.$transaction.mockResolvedValue([]);
});

describe('누가 만질 수 있는가', () => {
  it('가맹점은 기획전을 볼 수 없다 — 여러 브랜드를 가로지르는 플랫폼의 자리다', async () => {
    await expect(getAdminCollections(merchant, NOW)).rejects.toThrow();
  });

  it('고객은 당연히 못 만든다', async () => {
    await expect(
      createCollection(customer, { slug: 'x-y', title: 'T' } as never),
    ).rejects.toThrow();
  });

  it('운영진은 본다', async () => {
    db.collection.findMany.mockResolvedValue([row()]);
    const rows = await getAdminCollections(admin, NOW);
    expect(rows[0]).toMatchObject({ slug: 'winter-outer', status: 'LIVE', itemCount: 3 });
  });

  it('꺼져 있거나 끝난 것도 보여 준다 — 안 보이면 고칠 수 없다', async () => {
    db.collection.findMany.mockResolvedValue([
      row({ id: 'c-off', isActive: false }),
      row({ id: 'c-end', endsAt: new Date('2026-01-01T00:00:00Z') }),
    ]);
    const rows = await getAdminCollections(admin, NOW);
    expect(rows.map((c) => c.status)).toEqual(['PAUSED', 'ENDED']);
  });
});

describe('주소는 하나뿐이다', () => {
  it('이미 쓰는 주소로는 못 만든다', async () => {
    db.collection.findUnique.mockResolvedValue({ id: 'c-other' });
    await expect(
      createCollection(admin, { slug: 'winter-outer', title: 'T' } as never),
    ).rejects.toMatchObject({ code: 'SLUG_TAKEN', status: 409 });
  });

  it('남의 주소로 바꾸려 하면 막는다', async () => {
    db.collection.findUnique
      .mockResolvedValueOnce(row())
      .mockResolvedValueOnce({ id: 'c-other' });
    await expect(
      updateCollection(admin, 'c-1', { slug: 'taken' }),
    ).rejects.toMatchObject({ code: 'SLUG_TAKEN' });
  });

  it('자기 주소를 그대로 두는 것은 충돌이 아니다', async () => {
    db.collection.findUnique.mockResolvedValue(row());
    db.collection.update.mockResolvedValue(row({ title: '새 제목' }));

    await updateCollection(admin, 'c-1', { slug: 'winter-outer', title: '새 제목' });
    // 중복 조회를 한 번도 하지 않았다 — 자기 주소면 물어볼 것이 없다
    expect(db.collection.findUnique).toHaveBeenCalledTimes(1);
  });
});

describe('담긴 상품', () => {
  it('보낸 순서가 곧 진열 순서다', async () => {
    db.collection.findUnique.mockResolvedValue({ id: 'c-1' });
    db.product.count.mockResolvedValue(3);
    db.collection.findUniqueOrThrow.mockResolvedValue(row());

    await setCollectionItems(admin, 'c-1', ['p-3', 'p-1', 'p-2']);

    const created = db.collectionItem.createMany.mock.calls[0]![0].data;
    expect(created).toEqual([
      { collectionId: 'c-1', productId: 'p-3', sortOrder: 0 },
      { collectionId: 'c-1', productId: 'p-1', sortOrder: 1 },
      { collectionId: 'c-1', productId: 'p-2', sortOrder: 2 },
    ]);
  });

  it('지우기와 넣기를 한 트랜잭션에서 한다 — 갈라지면 기획전이 빈다', async () => {
    db.collection.findUnique.mockResolvedValue({ id: 'c-1' });
    db.product.count.mockResolvedValue(1);
    db.collection.findUniqueOrThrow.mockResolvedValue(row());

    await setCollectionItems(admin, 'c-1', ['p-1']);

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.$transaction.mock.calls[0]![0]).toHaveLength(2);
  });

  it('다 빼는 것도 편집이다 — 넣기 없이 지우기만 한다', async () => {
    db.collection.findUnique.mockResolvedValue({ id: 'c-1' });
    db.collection.findUniqueOrThrow.mockResolvedValue(row({ _count: { items: 0 } }));

    await setCollectionItems(admin, 'c-1', []);

    expect(db.$transaction.mock.calls[0]![0]).toHaveLength(1);
    expect(db.collectionItem.createMany).not.toHaveBeenCalled();
    // 없는 상품을 확인할 일도 없다
    expect(db.product.count).not.toHaveBeenCalled();
  });

  it('없는 상품이 섞이면 통째로 거절한다 — 조용히 빼면 담은 줄 안다', async () => {
    db.collection.findUnique.mockResolvedValue({ id: 'c-1' });
    db.product.count.mockResolvedValue(2);

    await expect(
      setCollectionItems(admin, 'c-1', ['p-1', 'p-2', 'p-없음']),
    ).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('내려간 상품도 담을 수 있다 — 다시 올릴 예정으로 미리 담는다', async () => {
    db.collection.findUnique.mockResolvedValue({ id: 'c-1' });
    db.product.count.mockResolvedValue(1);
    db.collection.findUniqueOrThrow.mockResolvedValue(row());

    await setCollectionItems(admin, 'c-1', ['p-hidden']);

    // 지운 상품만 뺀다. 매대 조건은 걸지 않는다.
    expect(db.product.count.mock.calls[0]![0].where).toEqual({
      id: { in: ['p-hidden'] },
      deletedAt: null,
    });
  });

  it('없는 기획전에는 담지 않는다', async () => {
    await expect(setCollectionItems(admin, 'c-없음', ['p-1'])).rejects.toBeInstanceOf(
      CollectionError,
    );
  });
});

describe('어드민에서 보는 담긴 상품', () => {
  const item = (over: Record<string, unknown> = {}) => ({
    product: {
      id: 'p-1', slug: 'coat', name: '코트',
      deletedAt: null, publishedAt: new Date('2026-01-01'), status: 'ACTIVE',
      brand: { name: 'STUDIO NOON', merchant: { status: 'APPROVED' } },
      images: [{ url: 'https://x/1.jpg' }],
      ...over,
    },
  });

  it('내려간 상품을 감추지 않고 표시한다 — 감추면 왜 짧아졌는지 알 수 없다', async () => {
    db.collectionItem.findMany.mockResolvedValue([
      item(),
      item({ id: 'p-2', status: 'HIDDEN' }),
      item({ id: 'p-3', publishedAt: null }),
      item({ id: 'p-4', brand: { name: 'B', merchant: { status: 'SUSPENDED' } } }),
    ]);

    const rows = await getCollectionItems(admin, 'c-1');
    expect(rows.map((r) => r.onDisplay)).toEqual([true, false, false, false]);
  });

  it('자사 직매입(가맹점 없음)은 매대에 선다', async () => {
    db.collectionItem.findMany.mockResolvedValue([
      item({ brand: { name: 'PLAIN', merchant: null } }),
    ]);
    expect((await getCollectionItems(admin, 'c-1'))[0]!.onDisplay).toBe(true);
  });
});

describe('지우기', () => {
  it('없는 것을 지우려 하면 알려 준다', async () => {
    await expect(deleteCollection(admin, 'c-없음')).rejects.toMatchObject({
      code: 'COLLECTION_NOT_FOUND',
    });
  });

  it('담긴 줄은 관계가 지운다 — 상품 자체는 건드리지 않는다', async () => {
    db.collection.findUnique.mockResolvedValue({ id: 'c-1', storageKey: null });
    db.collection.delete.mockResolvedValue({});

    await deleteCollection(admin, 'c-1');

    expect(db.collectionItem.deleteMany).not.toHaveBeenCalled();
  });
});
