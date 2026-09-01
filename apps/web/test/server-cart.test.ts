import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  cartItem: {
    findMany: vi.fn<(...a: any[]) => any>(),
    deleteMany: vi.fn<(...a: any[]) => any>(),
    createMany: vi.fn<(...a: any[]) => any>(),
  },
  productVariant: { findMany: vi.fn<(...a: any[]) => any>() },
  $transaction: vi.fn<(...a: any[]) => any>(),
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const { getServerCart, replaceServerCart, mergeServerCart } =
  await import('~/lib/cart/server-cart');

const USER = 'u-1';
const V1 = 'cmtgrsydv0011x9ohazcdqo6p';
const V2 = 'cmtgrsydt0010x9oh878ft0ck';

const row = (variantId: string, quantity = 1, selected = true) => ({
  variantId, quantity, selected,
  variant: {
    label: '오트밀 / M', priceOverride: null,
    product: {
      id: 'p-1', name: '코트', listPrice: 413_000, salePrice: 289_000,
      brand: { name: 'STUDIO NOON' },
    },
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  db.cartItem.findMany.mockResolvedValue([]);
  db.productVariant.findMany.mockImplementation(({ where }: any) =>
    Promise.resolve((where.id.in as string[]).filter((id) => id === V1 || id === V2).map((id) => ({ id }))));
  db.$transaction.mockResolvedValue([]);
});

describe('읽기', () => {
  it('표시용 값은 상품에서 가져온다 — 담을 당시 가격을 저장하지 않는다', async () => {
    // 저장해 두면 값이 바뀐 뒤에도 옛 가격이 남아 사용자를 오해하게 만든다
    db.cartItem.findMany.mockResolvedValue([row(V1, 2)]);
    const [item] = await getServerCart(USER);
    expect(item).toMatchObject({
      variantId: V1, quantity: 2, productName: '코트',
      brand: 'STUDIO NOON', listPrice: 413_000, salePrice: 289_000,
    });
  });

  it('옵션별 가격이 있으면 그것을 쓴다', async () => {
    const r = row(V1);
    r.variant.priceOverride = 300_000 as never;
    db.cartItem.findMany.mockResolvedValue([r]);
    expect((await getServerCart(USER))[0]?.salePrice).toBe(300_000);
  });

  it('할인이 없으면 정가가 판매가다', async () => {
    const r = row(V1);
    r.variant.product.salePrice = null as never;
    db.cartItem.findMany.mockResolvedValue([r]);
    expect((await getServerCart(USER))[0]?.salePrice).toBe(413_000);
  });
});

describe('전체 교체', () => {
  it('지우고 다시 넣는다 — 마지막에 보낸 것이 곧 결과다', async () => {
    await replaceServerCart(USER, [{ variantId: V1, quantity: 2, selected: true }]);
    expect(db.$transaction).toHaveBeenCalledOnce();
    expect(db.cartItem.deleteMany).toHaveBeenCalledWith({ where: { userId: USER } });
  });

  it('없는 옵션은 걸러 낸다 — 한 줄 때문에 전체가 실패하면 안 된다', async () => {
    await replaceServerCart(USER, [
      { variantId: V1, quantity: 1, selected: true },
      { variantId: 'cmtgrsydv0011x9ohazcdqo6q', quantity: 1, selected: true },
    ]);
    const created = db.cartItem.createMany.mock.calls[0]?.[0].data;
    expect(created).toHaveLength(1);
    expect(created[0].variantId).toBe(V1);
  });

  it('전부 없는 옵션이면 비우기만 한다', async () => {
    await replaceServerCart(USER, [{ variantId: 'cmtgrsydv0011x9ohazcdqo6q', quantity: 1, selected: true }]);
    expect(db.cartItem.createMany).not.toHaveBeenCalled();
    expect(db.cartItem.deleteMany).toHaveBeenCalled();
  });

  it('빈 장바구니도 저장된다 — 다 비운 것도 의사다', async () => {
    await replaceServerCart(USER, []);
    expect(db.cartItem.deleteMany).toHaveBeenCalled();
    expect(db.cartItem.createMany).not.toHaveBeenCalled();
  });
});

describe('병합', () => {
  it('서버 것과 로컬 것을 합쳐 저장한다', async () => {
    db.cartItem.findMany
      .mockResolvedValueOnce([{ variantId: V1, quantity: 3, selected: true }])
      .mockResolvedValueOnce([row(V1, 3), row(V2, 5)]);

    const result = await mergeServerCart(USER, [
      { variantId: V1, quantity: 1, selected: true },
      { variantId: V2, quantity: 5, selected: true },
    ]);

    // 저장된 내용: V1 은 큰 쪽(3), V2 는 로컬 것(5)
    const saved = db.cartItem.createMany.mock.calls[0]?.[0].data;
    expect(saved).toEqual(expect.arrayContaining([
      expect.objectContaining({ variantId: V1, quantity: 3 }),
      expect.objectContaining({ variantId: V2, quantity: 5 }),
    ]));
    expect(result).toHaveLength(2);
  });

  it('로컬이 비어도 서버 것은 살아남는다', async () => {
    // 로그인만 했는데 다른 기기의 장바구니가 비워지면 안 된다
    db.cartItem.findMany
      .mockResolvedValueOnce([{ variantId: V1, quantity: 2, selected: true }])
      .mockResolvedValueOnce([row(V1, 2)]);
    await mergeServerCart(USER, []);
    expect(db.cartItem.createMany.mock.calls[0]?.[0].data).toHaveLength(1);
  });
});
