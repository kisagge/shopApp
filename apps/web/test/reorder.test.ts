import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 지난 주문 다시 담기 — 조회와 창구.
 *
 * 다시 사는 길이 어디에도 없었다. 주문 줄은 옵션 id 를 그대로 갖고 있다.
 */

const db = vi.hoisted(() => ({
  order: { findFirst: vi.fn<(...a: any[]) => any>() },
  productVariant: { findMany: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const getSessionUser = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/auth/session', () => ({ getSessionUser }));
const enforceRateLimit = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/rate-limit', () => ({ enforceRateLimit }));

const { planReorderFor } = await import('~/lib/orders/reorder');
const { POST } = await import('~/app/api/orders/[orderNo]/reorder/route');

const orderLine = (variantId: string, over: Record<string, unknown> = {}) => ({
  variantId, quantity: 1, canceledAt: null,
  productName: '옛 이름 코트', optionLabel: '오트 / M', ...over,
});

const variantRow = (id: string, over: Record<string, unknown> = {}) => ({
  id, label: '오트 / M', stock: 5, isActive: true, priceOverride: null,
  product: {
    id: 'p-1', name: '울 코트', listPrice: 413_000, salePrice: 289_000,
    status: 'ACTIVE', deletedAt: null,
    brand: { name: '무어', merchant: null },
    images: [{ url: '/coat.jpg', blurDataUrl: null }],
  },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUser.mockResolvedValue({ id: 'u-buyer' });
  enforceRateLimit.mockResolvedValue(null);
  db.order.findFirst.mockResolvedValue({ items: [orderLine('v-1', { quantity: 2 })] });
  db.productVariant.findMany.mockResolvedValue([variantRow('v-1')]);
});

describe('담을 줄 만들기', () => {
  it('장바구니 한 줄을 그대로 만들 수 있는 값을 준다 — 이름은 지금 값이다', async () => {
    const plan = await planReorderFor('u-buyer', 'O-1', []);

    expect(plan!.add).toEqual([{
      variantId: 'v-1', productId: 'p-1', productName: '울 코트', brand: '무어',
      optionLabel: '오트 / M', listPrice: 413_000, salePrice: 289_000,
      imageUrl: '/coat.jpg', blurDataUrl: null, quantity: 2, reduced: false,
    }]);
  });

  it('자기 주문만 찾는다', async () => {
    await planReorderFor('u-buyer', 'O-1', []);
    expect(db.order.findFirst.mock.calls[0]![0].where).toEqual({ orderNo: 'O-1', userId: 'u-buyer' });
  });

  it('남의 주문이면 없는 주문과 같다', async () => {
    db.order.findFirst.mockResolvedValue(null);
    expect(await planReorderFor('u-other', 'O-1', [])).toBeNull();
  });

  it('못 담은 줄은 주문 때 적어 둔 이름으로 말한다 — 상품이 지워졌을 수 있다', async () => {
    db.productVariant.findMany.mockResolvedValue([]);

    const plan = await planReorderFor('u-buyer', 'O-1', []);

    expect(plan).toEqual({
      add: [],
      skipped: [{ productName: '옛 이름 코트', optionLabel: '오트 / M', reason: 'UNAVAILABLE' }],
    });
  });

  it('취소한 줄은 담지 않는다', async () => {
    db.order.findFirst.mockResolvedValue({ items: [orderLine('v-1', { canceledAt: new Date() })] });

    const plan = await planReorderFor('u-buyer', 'O-1', []);

    expect(plan!.add).toEqual([]);
    expect(plan!.skipped[0]!.reason).toBe('CANCELED');
  });

  it('재고만큼만 담고 줄였다고 표시한다', async () => {
    db.productVariant.findMany.mockResolvedValue([variantRow('v-1', { stock: 1 })]);

    const plan = await planReorderFor('u-buyer', 'O-1', []);

    expect(plan!.add[0]).toMatchObject({ quantity: 1, reduced: true });
  });

  it('옵션마다 따로 정한 가격을 쓴다', async () => {
    db.productVariant.findMany.mockResolvedValue([variantRow('v-1', { priceOverride: 299_000 })]);
    expect((await planReorderFor('u-buyer', 'O-1', []))!.add[0]!.salePrice).toBe(299_000);
  });
});

describe('창구', () => {
  const call = (body: unknown = { cartVariantIds: [] }, orderNo = 'O-1') =>
    POST(
      new Request(`http://localhost/api/orders/${orderNo}/reorder`, { method: 'POST', body: JSON.stringify(body) }),
      { params: Promise.resolve({ orderNo }) },
    );

  it('로그인해야 한다', async () => {
    getSessionUser.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
    expect(db.order.findFirst).not.toHaveBeenCalled();
  });

  it('담을 줄을 돌려준다', async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect((await response.json()).add).toHaveLength(1);
  });

  it('남의 주문은 없는 주문과 똑같이 답한다', async () => {
    db.order.findFirst.mockResolvedValue(null);
    const response = await call();
    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe('ORDER_NOT_FOUND');
  });

  it('제한을 건다', async () => {
    enforceRateLimit.mockResolvedValue(new Response(null, { status: 429 }));
    expect((await call()).status).toBe(429);
  });

  it('장바구니 목록의 모양이 틀리면 400', async () => {
    expect((await call({ cartVariantIds: ['nope'] })).status).toBe(400);
  });

  it('본문이 JSON 이 아니면 400', async () => {
    const response = await POST(
      new Request('http://localhost/api/orders/O-1/reorder', { method: 'POST', body: '{' }),
      { params: Promise.resolve({ orderNo: 'O-1' }) },
    );
    expect(response.status).toBe(400);
  });
});
