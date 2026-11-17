import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkExchangeOption } from '@shop/core';

/**
 * 교환으로 고를 수 있는 옵션 — 줄마다.
 *
 * **화면이 내미는 목록과 서버가 받는 조건이 같은 함수여야 한다**(core
 * `checkExchangeOption`). 화면이 고를 수 있게 둔 옵션을 신청에서 거절하면 손님은
 * 무엇을 골라야 하는지 알 수 없고, 반대로 화면이 빠뜨리면 바꿀 수 있는 옵션을
 * 영영 못 고른다. 그 조건이 여기서 손으로 다시 적히는 순간 둘이 갈린다.
 */

const db = vi.hoisted(() => ({
  productVariant: { findMany: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db, Prisma: { JsonNull: 'JsonNull' } }));
const cache = await vi.hoisted(async () => (await import('./support/cache-mock')).cacheMock());
vi.mock('~/lib/cache', () => cache);

const { getExchangeOptions } = await import('~/lib/queries/orders');

/** 주문에 담긴 줄 — 코트 M 한 장 */
const line = (over: Record<string, unknown> = {}) => ({
  id: 'oi-1',
  quantity: 1,
  variant: { id: 'v-m', productId: 'p-coat', priceOverride: null },
  ...over,
});

/** 같은 상품의 형제 옵션 */
const sibling = (over: Record<string, unknown> = {}) => ({
  id: 'v-l',
  productId: 'p-coat',
  priceOverride: null,
  stock: 3,
  isActive: true,
  label: '오트 / L',
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('무엇을 묻는가', () => {
  it('줄이 없으면 묻지 않는다 — 빈 조건으로 변형을 통째로 긁어오지 않는다', async () => {
    expect(await getExchangeOptions([])).toEqual({});
    expect(db.productVariant.findMany).not.toHaveBeenCalled();
  });

  it('줄이 열이어도 한 번만 묻는다', async () => {
    db.productVariant.findMany.mockResolvedValue([]);
    const lines = Array.from({ length: 10 }, (_, i) => line({ id: `oi-${i}` }));

    await getExchangeOptions(lines);

    expect(db.productVariant.findMany).toHaveBeenCalledTimes(1);
  });

  it('같은 상품을 두 줄이 가리키면 한 번만 적어 보낸다', async () => {
    db.productVariant.findMany.mockResolvedValue([]);

    await getExchangeOptions([line(), line({ id: 'oi-2', variant: { id: 'v-s', productId: 'p-coat', priceOverride: null } })]);

    expect(db.productVariant.findMany.mock.calls[0]![0].where).toEqual({ productId: { in: ['p-coat'] } });
  });

  it('고르는 순서를 못 박는다 — 화면마다 흔들리면 같은 목록으로 안 보인다', async () => {
    db.productVariant.findMany.mockResolvedValue([]);

    await getExchangeOptions([line()]);

    expect(db.productVariant.findMany.mock.calls[0]![0].orderBy).toEqual({ createdAt: 'asc' });
  });
});

describe('무엇을 고를 수 있는가', () => {
  /*
   * 거절의 까닭 네 가지(core `EXCHANGE_OPTION_MESSAGE`)가 **모두** 여기서도
   * 걸러져야 한다. 하나라도 새면 화면이 내민 옵션이 신청에서 거절된다.
   */
  const CASES = [
    ['같은 상품의 다른 옵션이면 고를 수 있다', sibling(), true],
    ['다른 상품의 변형은 섞이지 않는다', sibling({ id: 'v-x', productId: 'p-knit' }), false],
    ['추가금이 다르면 못 고른다 — 돈이 움직이는 교환은 교환이 아니다', sibling({ priceOverride: 5_000 }), false],
    ['판매를 멈춘 옵션은 못 고른다', sibling({ isActive: false }), false],
    ['수량만큼 재고가 없으면 못 고른다', sibling({ stock: 0 }), false],
  ] as const;

  it.each(CASES)('%s', async (_what, candidate, expected) => {
    db.productVariant.findMany.mockResolvedValue([candidate]);

    const options = await getExchangeOptions([line()]);

    expect(options['oi-1']!.map((o) => o.variantId)).toEqual(expected ? [candidate.id] : []);
  });

  it('core 가 거절하는 것은 여기서도 거절한다 — 같은 규칙이다', async () => {
    /*
     * 위의 다섯 경우를 core 에 직접 물어본 답과 맞춰 본다. 이 조건이 조회 안에서
     * 손으로 다시 적히면 둘이 갈리고, 그 갈림이 바로 "화면에선 되는데 신청하면
     * 안 되는" 상태다.
     */
    for (const [, candidate] of CASES) {
      db.productVariant.findMany.mockResolvedValue([candidate]);
      const options = await getExchangeOptions([line()]);
      const fromCore = checkExchangeOption(
        { productId: 'p-coat', variantId: 'v-m', priceOverride: null, quantity: 1 },
        { productId: candidate.productId, variantId: candidate.id, priceOverride: candidate.priceOverride, stock: candidate.stock, isActive: candidate.isActive },
      ).ok;

      expect(options['oi-1']!.length > 0, `${candidate.id} 의 답이 core 와 다르다`).toBe(fromCore);
    }
  });

  it('지금 받은 그 옵션도 목록에 든다 — 불량이면 같은 것으로 다시 받는다', async () => {
    db.productVariant.findMany.mockResolvedValue([sibling({ id: 'v-m', label: '오트 / M' })]);

    const options = await getExchangeOptions([line()]);

    expect(options['oi-1']!.map((o) => o.variantId)).toEqual(['v-m']);
  });

  it('재고는 줄의 수량만큼 필요하다 — 두 장을 바꾸려면 두 장이 있어야 한다', async () => {
    db.productVariant.findMany.mockResolvedValue([sibling({ stock: 1 })]);

    const one = await getExchangeOptions([line({ quantity: 1 })]);
    const two = await getExchangeOptions([line({ quantity: 2 })]);

    expect(one['oi-1']).toHaveLength(1);
    expect(two['oi-1']).toHaveLength(0);
  });
});

describe('무엇을 돌려주는가', () => {
  it('줄마다 따로 센다 — 수량이 다르면 고를 수 있는 것도 다르다', async () => {
    db.productVariant.findMany.mockResolvedValue([sibling({ stock: 1 })]);

    const options = await getExchangeOptions([
      line({ id: 'oi-1', quantity: 1 }),
      line({ id: 'oi-2', quantity: 2 }),
    ]);

    expect(options['oi-1']!.map((o) => o.variantId)).toEqual(['v-l']);
    expect(options['oi-2']).toEqual([]);
  });

  it('고를 것이 없는 줄도 칸을 남긴다 — 빈 목록과 모름은 다르다', async () => {
    db.productVariant.findMany.mockResolvedValue([]);

    const options = await getExchangeOptions([line()]);

    expect(Object.keys(options)).toEqual(['oi-1']);
    expect(options['oi-1']).toEqual([]);
  });

  it('고를 이름과 식별자만 내보낸다 — 재고 수와 추가금은 화면에 흘리지 않는다', async () => {
    db.productVariant.findMany.mockResolvedValue([sibling()]);

    const options = await getExchangeOptions([line()]);

    expect(options['oi-1']![0]).toEqual({ variantId: 'v-l', label: '오트 / L' });
  });
});
