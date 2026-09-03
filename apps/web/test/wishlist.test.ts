import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  product: { findFirst: vi.fn<(...a: any[]) => any>() },
  wishlistItem: {
    count: vi.fn<(...a: any[]) => any>(),
    upsert: vi.fn<(...a: any[]) => any>(),
    deleteMany: vi.fn<(...a: any[]) => any>(),
    findMany: vi.fn<(...a: any[]) => any>(),
  },
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const {
  addToWishlist, removeFromWishlist, getWishlist, getWishlistedIds, MAX_WISHLIST_ITEMS,
} = await import('~/lib/wishlist/wishlist');

const USER = 'u-1';
const P = 'cmtgrsyc8000hx9oh6tozfnvx';

const row = (over: Record<string, unknown> = {}) => ({
  createdAt: new Date('2026-09-01'),
  product: {
    id: P, slug: 'coat', name: '코트', status: 'ACTIVE',
    listPrice: 413_000, salePrice: 289_000,
    deletedAt: null, publishedAt: new Date('2026-07-01'),
    brand: { name: 'STUDIO NOON', merchant: { status: 'APPROVED' } },
    images: [{ url: 'https://x/i.png', alt: '코트' }],
    variants: [{ stock: 3 }],
    ...over,
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  db.product.findFirst.mockResolvedValue({ id: P });
  db.wishlistItem.count.mockResolvedValue(0);
  db.wishlistItem.findMany.mockResolvedValue([]);
});

describe('넣기', () => {
  it('없는 상품은 404', async () => {
    db.product.findFirst.mockResolvedValue(null);
    await expect(addToWishlist(USER, P)).rejects.toMatchObject({
      code: 'PRODUCT_NOT_FOUND', status: 404,
    });
    expect(db.wishlistItem.upsert).not.toHaveBeenCalled();
  });

  it('삭제된 상품도 넣을 수 없다', async () => {
    db.product.findFirst.mockResolvedValue(null);
    await expect(addToWishlist(USER, P)).rejects.toThrow();
    expect(db.product.findFirst.mock.calls[0]?.[0].where.deletedAt).toBeNull();
  });

  it('이미 있으면 조용히 넘어간다 — 원하던 상태다', async () => {
    // "이미 찜했습니다" 는 오류가 아니다
    await addToWishlist(USER, P);
    const args = db.wishlistItem.upsert.mock.calls[0]?.[0];
    expect(args.where).toEqual({ userId_productId: { userId: USER, productId: P } });
    expect(args.update).toEqual({});
  });

  it('여러 번 넣어도 결과가 같다', async () => {
    await addToWishlist(USER, P);
    await addToWishlist(USER, P);
    // upsert 라 행이 늘지 않는다
    expect(db.wishlistItem.upsert).toHaveBeenCalledTimes(2);
    expect(db.wishlistItem.upsert.mock.calls.every((c) => c[0].update !== undefined)).toBe(true);
  });

  it('상한을 넘으면 거절한다', async () => {
    db.wishlistItem.count.mockResolvedValue(MAX_WISHLIST_ITEMS);
    await expect(addToWishlist(USER, P)).rejects.toMatchObject({ code: 'TOO_MANY', status: 409 });
  });
});

describe('빼기', () => {
  it('없어도 성공한다 — 원하던 상태다', async () => {
    db.wishlistItem.deleteMany.mockResolvedValue({ count: 0 });
    await expect(removeFromWishlist(USER, P)).resolves.toBeUndefined();
  });

  it('내 것만 지운다', async () => {
    db.wishlistItem.deleteMany.mockResolvedValue({ count: 1 });
    await removeFromWishlist(USER, P);
    expect(db.wishlistItem.deleteMany.mock.calls[0]?.[0].where)
      .toEqual({ userId: USER, productId: P });
  });
});

describe('목록', () => {
  it('할인가를 판매가로 쓴다', async () => {
    db.wishlistItem.findMany.mockResolvedValue([row()]);
    const [item] = await getWishlist(USER);
    expect(item).toMatchObject({ price: 289_000, listPrice: 413_000, brand: 'STUDIO NOON' });
  });

  it('할인이 없으면 정가다', async () => {
    db.wishlistItem.findMany.mockResolvedValue([row({ salePrice: null })]);
    expect((await getWishlist(USER))[0]?.price).toBe(413_000);
  });

  it('재고가 다 없으면 품절로 표시한다', async () => {
    db.wishlistItem.findMany.mockResolvedValue([row({ variants: [{ stock: 0 }] })]);
    expect((await getWishlist(USER))[0]?.soldOut).toBe(true);
  });

  it.each([
    ['삭제됨', { deletedAt: new Date() }],
    ['미게시', { publishedAt: null }],
    ['숨김', { status: 'HIDDEN' }],
    ['작성 중', { status: 'DRAFT' }],
  ])('%s 상품은 판매 종료로 표시한다', async (_l, over) => {
    // 목록에서 지우지 않는다 — 조용히 사라지면 자기가 찜을 지운 줄 안다
    db.wishlistItem.findMany.mockResolvedValue([row(over)]);
    const [item] = await getWishlist(USER);
    expect(item?.unavailable).toBe(true);
    expect(item?.name).toBe('코트');
  });

  it('가맹점이 정지되면 판매 종료다', async () => {
    db.wishlistItem.findMany.mockResolvedValue([
      row({ brand: { name: 'MOOR', merchant: { status: 'SUSPENDED' } } }),
    ]);
    expect((await getWishlist(USER))[0]?.unavailable).toBe(true);
  });

  it('자사 브랜드는 가맹점이 없어도 정상이다', async () => {
    db.wishlistItem.findMany.mockResolvedValue([
      row({ brand: { name: 'PLAIN LABEL', merchant: null } }),
    ]);
    expect((await getWishlist(USER))[0]?.unavailable).toBe(false);
  });
});

describe('찜 여부 일괄 조회', () => {
  it('목록 화면이 카드마다 묻지 않도록 한 번에 가져온다', async () => {
    db.wishlistItem.findMany.mockResolvedValue([{ productId: P }]);
    const ids = await getWishlistedIds(USER, [P, 'other']);
    expect(ids.has(P)).toBe(true);
    expect(ids.has('other')).toBe(false);
    expect(db.wishlistItem.findMany).toHaveBeenCalledOnce();
  });

  it('빈 목록이면 조회하지 않는다', async () => {
    expect((await getWishlistedIds(USER, [])).size).toBe(0);
    expect(db.wishlistItem.findMany).not.toHaveBeenCalled();
  });
});
