import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import sharp from 'sharp';
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
  collectionSlug: {
    findUnique: vi.fn<(...a: any[]) => any>(),
    upsert: vi.fn<(...a: any[]) => any>(),
    deleteMany: vi.fn<(...a: any[]) => any>(),
  },
  $transaction: vi.fn<(...a: any[]) => any>(),
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const {
  getAdminCollections, getCollectionItems, getCollectionItemsFor, createCollection,
  updateCollection, setCollectionItems, deleteCollection, CollectionError,
  reorderCollections, setCollectionImage,
} = await import('~/lib/admin/manage-collection');
const { MAX_COLLECTION_ITEMS } = await import('@shop/core');
const { setStorage } = await import('~/lib/storage');

const storage = {
  name: 'fake',
  put: vi.fn(async ({ key }: { key: string }) => ({ url: `https://cdn.test/${key}` })),
  remove: vi.fn(async () => {}),
};

/** 진짜 사진. 만들어 낸 헤더로는 다듬기가 되지 않는다. */
const png = async () => ({
  bytes: new Uint8Array(
    await sharp({ create: { width: 40, height: 40, channels: 3, background: '#888' } })
      .png()
      .toBuffer(),
  ),
  declaredType: 'image/png',
});

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
  db.collectionSlug.findUnique.mockResolvedValue(null);
  db.collectionSlug.upsert.mockResolvedValue({});
  db.collectionSlug.deleteMany.mockResolvedValue({ count: 0 });
  // 함수로 오면 실제로 돌리고, 배열이면 예전처럼 목록으로 받는다
  db.$transaction.mockImplementation(async (arg: unknown) =>
    typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(db) : [],
  );
  setStorage(storage);
});
afterEach(() => setStorage(undefined));

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
    collectionId: 'c-1',
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

describe('여러 기획전을 한 번에 읽는다', () => {
  const item = (collectionId: string, id: string) => ({
    collectionId,
    product: {
      id, slug: id, name: id,
      deletedAt: null, publishedAt: new Date('2026-01-01'), status: 'ACTIVE',
      brand: { name: 'B', merchant: null },
      images: [],
    },
  });

  it('기획전이 몇 개든 조회는 한 번이다', async () => {
    db.collectionItem.findMany.mockResolvedValue([
      item('c-1', 'p-1'), item('c-1', 'p-2'), item('c-2', 'p-3'),
    ]);

    const byCollection = await getCollectionItemsFor(admin, ['c-1', 'c-2']);

    expect(db.collectionItem.findMany).toHaveBeenCalledTimes(1);
    expect(byCollection.get('c-1')!.map((p) => p.id)).toEqual(['p-1', 'p-2']);
    expect(byCollection.get('c-2')!.map((p) => p.id)).toEqual(['p-3']);
  });

  it('담긴 것이 없는 기획전도 빈 목록으로 답한다 — 없는 것과 빈 것은 다르다', async () => {
    db.collectionItem.findMany.mockResolvedValue([]);
    const byCollection = await getCollectionItemsFor(admin, ['c-1']);
    expect(byCollection.get('c-1')).toEqual([]);
  });

  it('아무것도 안 물으면 DB 를 부르지 않는다', async () => {
    expect((await getCollectionItemsFor(admin, [])).size).toBe(0);
    expect(db.collectionItem.findMany).not.toHaveBeenCalled();
  });

  it('가맹점은 여기도 못 본다', async () => {
    await expect(getCollectionItemsFor(merchant, ['c-1'])).rejects.toThrow();
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

/**
 * **없는 기획전을 가리키면 404 로 말한다.**
 *
 * 고치기·상품 넣기·순서 바꾸기·배경 바꾸기가 각자 먼저 본다. 넷 다 안 돈 줄이었다.
 * 안 보면 프리즈마가 "레코드 없음" 으로 터지고(P2025) 운영자에게는 500 이 나간다 —
 * 지운 뒤에 또 누른 것인지 서버가 고장난 것인지 가를 수 없다.
 */
describe('없는 기획전을 가리키면', () => {
  it('고칠 수 없다', async () => {
    await expect(updateCollection(admin, 'c-gone', { title: '새 제목' }))
      .rejects.toMatchObject({ name: 'CollectionError', code: 'COLLECTION_NOT_FOUND', status: 404 });
  });

  it('상품을 넣을 수 없다', async () => {
    await expect(setCollectionItems(admin, 'c-gone', ['p-1']))
      .rejects.toMatchObject({ code: 'COLLECTION_NOT_FOUND', status: 404 });
    expect(db.collectionItem.createMany).not.toHaveBeenCalled();
  });

  it('배경을 바꿀 수 없다', async () => {
    await expect(setCollectionImage(admin, 'c-gone', { bytes: new Uint8Array([1]), declaredType: 'image/png' }, '배경'))
      .rejects.toMatchObject({ code: 'COLLECTION_NOT_FOUND', status: 404 });
  });

  /**
   * **순서 바꾸기는 목록이 통째로 맞아야 받는다.**
   *
   * 보낸 id 가 하나라도 우리 것이 아니거나 수가 다르면 거절한다. 일부만 받아 쓰면
   * **보내지 않은 기획전의 순서가 어긋나** 매대에 엉뚱한 차례로 뜬다 — 운영자는 자기가
   * 옮긴 것만 보고 있어서 그 사실을 모른다.
   */
  it.each([
    ['모르는 id 가 섞이면', ['c-1', 'c-gone']],
    ['수가 모자라면', ['c-1']],
    ['수가 넘치면', ['c-1', 'c-2', 'c-3']],
  ])('%s 순서를 바꾸지 않는다', async (_label, ordered) => {
    db.collection.findMany.mockResolvedValue([{ id: 'c-1' }, { id: 'c-2' }]);

    await expect(reorderCollections(admin, ordered))
      .rejects.toMatchObject({ code: 'COLLECTION_NOT_FOUND', status: 404 });
    expect(db.collection.update).not.toHaveBeenCalled();
  });
});

/**
 * **한 기획전에 넣을 수 있는 상품 수에 상한이 있다.**
 *
 * 매대가 한 번에 읽어 그리는 목록이라 수가 늘면 그 화면이 느려진다. 상한을 넘기면
 * 거절하는데, 그 줄이 안 돈 줄이었다 — 넘겨도 그대로 저장돼 **그 기획전을 연 손님이
 * 기다리게 된다.**
 */
describe('상품 수 상한', () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `p-${i}`);

  beforeEach(() => {
    db.collection.findUnique.mockResolvedValue({ id: 'c-1' });
    db.product.count.mockImplementation(({ where }: any) => Promise.resolve(where.id.in.length));
  });

  it('상한을 넘기면 거절한다', async () => {
    await expect(setCollectionItems(admin, 'c-1', ids(MAX_COLLECTION_ITEMS + 1)))
      .rejects.toMatchObject({ name: 'CollectionError', status: 400 });
    expect(db.collectionItem.createMany).not.toHaveBeenCalled();
  });

  it('상한까지는 받는다 — 거절이 한 칸 넓지 않은지', async () => {
    await expect(setCollectionItems(admin, 'c-1', ids(MAX_COLLECTION_ITEMS))).resolves.not.toThrow();
  });
});

describe('만들면 맨 뒤에 붙는다', () => {
  it('지금 개수가 곧 새 자리다 — 만드는 순간 맨 앞에 끼면 매대가 흔들린다', async () => {
    db.collection.count.mockResolvedValue(3);
    db.collection.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(row({ ...data })));

    await createCollection(admin, { slug: 'new-one', title: '새 기획전' } as never);

    expect(db.collection.create.mock.calls[0]![0].data).toMatchObject({
      slug: 'new-one', title: '새 기획전', sortOrder: 3,
    });
  });
});

describe('주소를 바꾸면 옛 주소가 따라온다', () => {
  /*
   * **거절만 검사돼 있었다.** 남의 주소로 바꾸려 할 때 막는 것은 보고 있었는데,
   * 실제로 바꿀 때 **옛 주소를 어디에 적어 두는지**는 한 줄도 안 돌았다.
   *
   * 옛 주소를 적어 두지 않으면 어제까지 공유된 링크가 그날부터 404 가 된다.
   * 반대로 **새 주소에 남아 있던 옛 기록은 지워야 한다** — 안 지우면 새 주소가
   * 자기 자신을 거쳐 돌아가는 꼴이 된다.
   */
  const renameTo = async (slug: string) => {
    db.collection.findUnique
      .mockResolvedValueOnce(row())          // 고칠 기획전
      .mockResolvedValueOnce(null);          // 그 주소를 쓰는 다른 기획전은 없다
    db.collection.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(row({ ...data })));
    return updateCollection(admin, 'c-1', { slug });
  };

  it('옛 주소가 이 기획전을 가리키게 적어 둔다', async () => {
    await renameTo('spring-outer');

    expect(db.collectionSlug.upsert).toHaveBeenCalledTimes(1);
    expect(db.collectionSlug.upsert.mock.calls[0]![0]).toMatchObject({
      where: { slug: 'winter-outer' },
      create: { slug: 'winter-outer', collectionId: 'c-1' },
      update: { collectionId: 'c-1' },
    });
  });

  it('새 주소에 남아 있던 옛 기록은 지운다 — 자기 자신으로 되돌아가지 않게', async () => {
    await renameTo('spring-outer');

    expect(db.collectionSlug.deleteMany).toHaveBeenCalledWith({ where: { slug: 'spring-outer' } });
  });

  it('고치기와 기록이 한 트랜잭션이다 — 하나만 남으면 주소가 어긋난 채 산다', async () => {
    await renameTo('spring-outer');

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(typeof db.$transaction.mock.calls[0]![0]).toBe('function');
  });

  it('주소를 그대로 두면 기록을 건드리지 않는다', async () => {
    db.collection.findUnique.mockResolvedValue(row());
    db.collection.update.mockResolvedValue(row({ title: '새 제목' }));

    await updateCollection(admin, 'c-1', { title: '새 제목' });

    expect(db.collectionSlug.upsert).not.toHaveBeenCalled();
    expect(db.collectionSlug.deleteMany).not.toHaveBeenCalled();
  });
});

describe('순서를 실제로 다시 적는 자리', () => {
  it('받은 순서대로 0부터 다시 적고, 바꾼 목록을 돌려준다', async () => {
    db.collection.findMany
      .mockResolvedValueOnce([{ id: 'c-1' }, { id: 'c-2' }])
      .mockResolvedValueOnce([row({ id: 'c-2', sortOrder: 0 }), row({ id: 'c-1', sortOrder: 1 })]);

    const after = await reorderCollections(admin, ['c-2', 'c-1']);

    expect(db.collection.update.mock.calls.map(([a]) => [a.where.id, a.data.sortOrder])).toEqual([
      ['c-2', 0],
      ['c-1', 1],
    ]);
    expect(after.map((r) => r.id)).toEqual(['c-2', 'c-1']);
  });

  it('가운데를 지우면 남은 것의 순서를 메운다', async () => {
    db.collection.findUnique.mockResolvedValue({ id: 'c-2', storageKey: null });
    db.collection.delete.mockResolvedValue({});
    db.collection.findMany.mockResolvedValue([
      { id: 'c-1', sortOrder: 0 },
      { id: 'c-3', sortOrder: 2 },
    ]);

    await deleteCollection(admin, 'c-2');

    expect(db.collection.update.mock.calls.map(([a]) => [a.where.id, a.data.sortOrder])).toEqual([
      ['c-3', 1],
    ]);
  });

  it('지울 때 걸려 있던 사진도 버린다 — 화면에서 사라지는 것이 우선이다', async () => {
    db.collection.findUnique.mockResolvedValue({
      id: 'c-1', storageKey: 'products/collection-c-1/old.png',
    });
    db.collection.delete.mockResolvedValue({});
    db.collection.findMany.mockResolvedValue([]);

    await deleteCollection(admin, 'c-1');

    expect(storage.remove).toHaveBeenCalledWith('products/collection-c-1/old.png');
  });
});

describe('배경 사진 교체 — 무엇을 넘기는가', () => {
  /*
   * 갈아 끼우는 순서는 `image-replace` 가 네 화면 몫으로 본다. 여기서는 배선만 본다.
   * 404 는 위의 "없는 기획전을 가리키면" 이 이미 본다.
   */
  beforeEach(() => {
    db.collection.findUnique.mockResolvedValue({ id: 'c-1', storageKey: null });
    db.collection.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(row({ ...data })));
  });

  it('키가 products/ 아래로 간다 — 버킷이 그 접두사만 공개한다', async () => {
    await setCollectionImage(admin, 'c-1', await png(), '배경');

    const key: string = storage.put.mock.calls[0]![0].key;
    expect(key.startsWith('products/collection-c-1/')).toBe(true);
  });

  it('올린 자리와 흐린 미리보기, 다듬은 대체 글을 함께 적는다', async () => {
    await setCollectionImage(admin, 'c-1', await png(), '  겨울 아웃터  ');

    const data = db.collection.update.mock.calls[0]![0].data as Record<string, unknown>;
    expect(data.imageUrl).toBe(`https://cdn.test/${storage.put.mock.calls[0]![0].key}`);
    expect(data.storageKey).toBe(storage.put.mock.calls[0]![0].key);
    expect(String(data.blurDataUrl)).toMatch(/^data:image\//);
    expect(data.imageAlt).toBe('겨울 아웃터');
  });

  it('대체 글이 공백뿐이면 비워 둔다', async () => {
    await setCollectionImage(admin, 'c-1', await png(), '  ');

    expect((db.collection.update.mock.calls[0]![0].data as Record<string, unknown>).imageAlt).toBeNull();
  });

  it('걸려 있던 파일은 지운다', async () => {
    db.collection.findUnique.mockResolvedValue({
      id: 'c-1', storageKey: 'products/collection-c-1/old.png',
    });
    await setCollectionImage(admin, 'c-1', await png(), '배경');

    expect(storage.remove).toHaveBeenCalledWith('products/collection-c-1/old.png');
  });
});
