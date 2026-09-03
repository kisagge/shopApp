import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  cartItem: {
    findMany: vi.fn<(...a: any[]) => any>(),
    deleteMany: vi.fn<(...a: any[]) => any>(),
    createMany: vi.fn<(...a: any[]) => any>(),
    upsert: vi.fn<(...a: any[]) => any>(),
  },
  productVariant: { findMany: vi.fn<(...a: any[]) => any>() },
  $transaction: vi.fn<(...a: any[]) => any>(),
}));
// 재시도 판정이 instanceof 를 쓴다. 목도 같은 모양이어야 한다.
class PrismaKnownError extends Error {
  code = '';
}
vi.mock('@shop/db', () => ({
  prisma: db,
  Prisma: { PrismaClientKnownRequestError: PrismaKnownError },
}));

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
  it('보낸 줄만 남긴다 — 마지막에 보낸 것이 곧 결과다', async () => {
    await replaceServerCart(USER, [{ variantId: V1, quantity: 2, selected: true }]);

    expect(db.$transaction).toHaveBeenCalledOnce();
    // 통째로 지우지 않는다. 지웠다 넣는 사이에 다른 저장이 끼어들면
    // 유니크 제약에 걸린다 — 탭을 두 개 열어 두면 실제로 난다.
    expect(db.cartItem.deleteMany).toHaveBeenCalledWith({
      where: { userId: USER, variantId: { notIn: [V1] } },
    });
    expect(db.cartItem.upsert.mock.calls[0]?.[0]).toMatchObject({
      where: { userId_variantId: { userId: USER, variantId: V1 } },
      update: { quantity: 2, selected: true },
    });
  });

  it('없는 옵션은 걸러 낸다 — 한 줄 때문에 전체가 실패하면 안 된다', async () => {
    await replaceServerCart(USER, [
      { variantId: V1, quantity: 1, selected: true },
      { variantId: 'cmtgrsydv0011x9ohazcdqo6q', quantity: 1, selected: true },
    ]);
    expect(db.cartItem.upsert).toHaveBeenCalledTimes(1);
    expect(db.cartItem.upsert.mock.calls[0]?.[0].create.variantId).toBe(V1);
  });

  it('전부 없는 옵션이면 비우기만 한다', async () => {
    await replaceServerCart(USER, [{ variantId: 'cmtgrsydv0011x9ohazcdqo6q', quantity: 1, selected: true }]);
    expect(db.cartItem.upsert).not.toHaveBeenCalled();
    // 쓸 수 있는 줄이 하나도 없으면 통째로 비운다
    expect(db.cartItem.deleteMany).toHaveBeenCalledWith({ where: { userId: USER } });
  });

  it('빈 장바구니도 저장된다 — 다 비운 것도 의사다', async () => {
    await replaceServerCart(USER, []);
    expect(db.cartItem.deleteMany).toHaveBeenCalledWith({ where: { userId: USER } });
    expect(db.cartItem.upsert).not.toHaveBeenCalled();
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
    const saved = db.cartItem.upsert.mock.calls.map((c: any[]) => c[0].create);
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
    expect(db.cartItem.upsert).toHaveBeenCalledTimes(1);
  });
});

describe('동시 저장', () => {
  it('유니크 충돌이면 한 번 다시 시도한다 — 탭 두 개면 실제로 난다', async () => {
    const conflict = Object.assign(new Error('unique'), { code: 'P2002' });
    Object.setPrototypeOf(conflict, PrismaKnownError.prototype);
    db.$transaction.mockRejectedValueOnce(conflict).mockResolvedValueOnce([]);

    await expect(replaceServerCart('u-1', [{ variantId: 'v-1', quantity: 1, selected: true }]))
      .resolves.toBeUndefined();
    expect(db.$transaction).toHaveBeenCalledTimes(2);
  });

  it('두 번째도 충돌하면 던진다 — 조용히 삼키면 아무도 모른다', async () => {
    const conflict = Object.assign(new Error('unique'), { code: 'P2002' });
    Object.setPrototypeOf(conflict, PrismaKnownError.prototype);
    db.$transaction.mockRejectedValue(conflict);

    await expect(
      replaceServerCart('u-1', [{ variantId: 'v-1', quantity: 1, selected: true }]),
    ).rejects.toBeTruthy();
    expect(db.$transaction).toHaveBeenCalledTimes(2);
  });

  it('다른 오류는 곧장 던진다', async () => {
    db.$transaction.mockRejectedValue(new Error('연결 끊김'));

    await expect(
      replaceServerCart('u-1', [{ variantId: 'v-1', quantity: 1, selected: true }]),
    ).rejects.toThrow('연결 끊김');
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });
});
