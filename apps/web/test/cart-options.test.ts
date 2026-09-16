import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 장바구니 한 줄의 바꿀 수 있는 옵션들 — 조회와 창구.
 *
 * 품절 줄에서 할 수 있는 일이 지우기뿐이었다. 같은 상품의 다른 옵션을 알려 주는 자리다.
 */

const db = vi.hoisted(() => ({
  productVariant: { findUnique: vi.fn<(...a: any[]) => any>() },
  product: { findUnique: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const getSessionUser = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/auth/session', () => ({ getSessionUser }));
const enforceRateLimit = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/rate-limit', () => ({ enforceRateLimit }));

const { getCartOptions } = await import('~/lib/cart/options');
const { GET } = await import('~/app/api/cart/options/route');

const V_L = 'cl0000000000000000000000l';
const V_M = 'cl0000000000000000000000m';

const variant = (id: string, label: string, stock: number, over: Record<string, unknown> = {}) => ({
  id, label, stock, isActive: true, priceOverride: null, ...over,
});

const product = (over: Record<string, unknown> = {}) => ({
  id: 'p-1', name: '울 코트', listPrice: 413_000, salePrice: 289_000,
  status: 'ACTIVE', deletedAt: null,
  brand: { name: '무어', merchant: { status: 'APPROVED' } },
  images: [{ url: '/coat.jpg', blurDataUrl: null }],
  variants: [variant(V_L, '오트 / L', 0), variant(V_M, '오트 / M', 4)],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUser.mockResolvedValue(null);
  enforceRateLimit.mockResolvedValue(null);
  db.productVariant.findUnique.mockResolvedValue({ productId: 'p-1' });
  db.product.findUnique.mockResolvedValue(product());
});

describe('조회', () => {
  it('같은 상품의 옵션을 재고와 함께 준다', async () => {
    const result = await getCartOptions(V_L);

    expect(result).toMatchObject({ productId: 'p-1', productName: '울 코트', brandName: '무어' });
    expect(result!.options.map((o) => [o.label, o.available])).toEqual([
      ['오트 / L', false],
      ['오트 / M', true],
    ]);
  });

  it('품절인 옵션도 목록에 남긴다 — 빼면 "L 은 어디 갔지" 가 된다', async () => {
    const result = await getCartOptions(V_M);
    expect(result!.options).toHaveLength(2);
  });

  it('판매 중인 옵션만 읽되, 지금 줄의 옵션은 멈췄어도 넣는다', async () => {
    await getCartOptions(V_L);

    expect(db.product.findUnique.mock.calls[0]![0].select.variants.where).toEqual({
      OR: [{ isActive: true }, { id: V_L }],
    });
  });

  it('판매를 멈춘 옵션은 고를 수 없다', async () => {
    db.product.findUnique.mockResolvedValue(product({
      variants: [variant(V_L, 'L', 5, { isActive: false }), variant(V_M, 'M', 4)],
    }));

    const result = await getCartOptions(V_L);

    expect(result!.options[0]!.available).toBe(false);
  });

  it('가맹점이 정지됐으면 어느 옵션도 고를 수 없다 — 견적과 같은 판단이다', async () => {
    db.product.findUnique.mockResolvedValue(product({
      brand: { name: '무어', merchant: { status: 'SUSPENDED' } },
    }));

    const result = await getCartOptions(V_L);

    expect(result!.options.every((o) => !o.available)).toBe(true);
  });

  it('옵션마다의 가격을 준다 — 따로 정한 값이 있으면 그것', async () => {
    db.product.findUnique.mockResolvedValue(product({
      variants: [variant(V_L, 'L', 1), variant(V_M, 'M', 1, { priceOverride: 299_000 })],
    }));

    const result = await getCartOptions(V_L);

    expect(result!.options.map((o) => o.unitPrice)).toEqual([289_000, 299_000]);
  });

  it.each([
    ['옵션이 없다', () => db.productVariant.findUnique.mockResolvedValue(null)],
    ['상품이 지워졌다', () => db.product.findUnique.mockResolvedValue(product({ deletedAt: new Date() }))],
    ['작성 중이다', () => db.product.findUnique.mockResolvedValue(product({ status: 'DRAFT' }))],
  ])('%s — 바꿀 것이 없다', async (_label, arrange) => {
    arrange();
    expect(await getCartOptions(V_L)).toBeNull();
  });
});

describe('창구', () => {
  const call = (variantId: string | null) =>
    GET(new Request(`http://localhost/api/cart/options${variantId === null ? '' : `?variantId=${variantId}`}`));

  it('비회원도 쓴다 — 장바구니는 로그인 없이 쓴다', async () => {
    const response = await call(V_L);
    expect(response.status).toBe(200);
  });

  it('재고가 담긴 답이라 어디에도 남기지 않는다', async () => {
    const response = await call(V_L);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('제한을 먼저 건다', async () => {
    enforceRateLimit.mockResolvedValue(new Response(null, { status: 429 }));
    expect((await call(V_L)).status).toBe(429);
    expect(db.productVariant.findUnique).not.toHaveBeenCalled();
  });

  it('옵션 id 가 없거나 모양이 틀리면 400', async () => {
    expect((await call(null)).status).toBe(400);
    expect((await call('nope')).status).toBe(400);
  });

  it('상품이 없으면 404', async () => {
    db.productVariant.findUnique.mockResolvedValue(null);
    expect((await call(V_L)).status).toBe(404);
  });
});
