import { describe, it, expect } from 'vitest';
import { checkExchangeOption, type ExchangeOriginal, type ExchangeCandidate } from '../src';

/** 교환 옵션 — 돈이 움직이지 않는 범위에서만 바꾼다 */
const original: ExchangeOriginal = { productId: 'p-1', variantId: 'v-m', priceOverride: null, quantity: 2 };
const candidate = (over: Partial<ExchangeCandidate> = {}): ExchangeCandidate => ({
  productId: 'p-1', variantId: 'v-l', priceOverride: null, stock: 5, isActive: true, ...over,
});

describe('checkExchangeOption', () => {
  it('같은 상품·같은 추가금·재고 충분이면 바꿀 수 있다', () => {
    expect(checkExchangeOption(original, candidate())).toEqual({ ok: true });
  });

  it('같은 옵션으로도 바꿀 수 있다 — 불량품을 새것으로', () => {
    expect(checkExchangeOption(original, candidate({ variantId: 'v-m' }))).toEqual({ ok: true });
  });

  it('다른 상품은 안 된다', () => {
    expect(checkExchangeOption(original, candidate({ productId: 'p-2' }))).toEqual({ ok: false, code: 'DIFFERENT_PRODUCT' });
  });

  it('추가금이 다르면 안 된다 — 차액이 생기면 반품과 새 주문이다', () => {
    expect(checkExchangeOption(original, candidate({ priceOverride: 5_000 }))).toEqual({ ok: false, code: 'PRICE_DIFFERS' });
    expect(checkExchangeOption({ ...original, priceOverride: 5_000 }, candidate({ priceOverride: 5_000 }))).toEqual({ ok: true });
  });

  it('판매 중지·재고 모자람은 안 된다 — 수량만큼 있어야 한다', () => {
    expect(checkExchangeOption(original, candidate({ isActive: false }))).toEqual({ ok: false, code: 'INACTIVE' });
    expect(checkExchangeOption(original, candidate({ stock: 1 }))).toEqual({ ok: false, code: 'OUT_OF_STOCK' });
    expect(checkExchangeOption(original, candidate({ stock: 2 }))).toEqual({ ok: true });
  });
});
