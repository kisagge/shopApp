/**
 * 교환 — 바꿀 옵션을 고르는 규칙. 순수 로직만.
 *
 * 교환은 **돈이 움직이지 않는** 반품이다. 받은 것을 돌려보내고 같은 상품의 다른(또는 같은) 옵션을 다시 받는다.
 * 그래서 가격이 다른 옵션으로는 바꿀 수 없다 — 차액을 받거나 돌려주는 순간 그것은 반품과 새 주문이다. 차액 결제를
 * 교환 안에 넣으면 결제·환불·정산이 교환마다 한 갈래씩 늘어난다.
 *
 * 가격은 **옵션 추가금(priceOverride)이 같은지**로 본다. 주문 뒤 상품 할인이 끝나 판매가가 바뀌어도, 같은 상품의 같은
 * 값 옵션이면 손님이 치른 값 그대로 바꿀 수 있어야 한다 — 불량품을 같은 옵션으로 바꾸는데 "가격이 달라졌다" 고
 * 막으면 안 된다.
 */

export interface ExchangeOriginal {
  readonly productId: string;
  readonly variantId: string;
  readonly priceOverride: number | null;
  readonly quantity: number;
}

export interface ExchangeCandidate {
  readonly productId: string;
  readonly variantId: string;
  readonly priceOverride: number | null;
  readonly stock: number;
  readonly isActive: boolean;
}

export type ExchangeOptionCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: 'DIFFERENT_PRODUCT' | 'PRICE_DIFFERS' | 'INACTIVE' | 'OUT_OF_STOCK' };

export function checkExchangeOption(original: ExchangeOriginal, candidate: ExchangeCandidate): ExchangeOptionCheck {
  if (candidate.productId !== original.productId) return { ok: false, code: 'DIFFERENT_PRODUCT' };
  if ((candidate.priceOverride ?? null) !== (original.priceOverride ?? null)) return { ok: false, code: 'PRICE_DIFFERS' };
  if (!candidate.isActive) return { ok: false, code: 'INACTIVE' };
  // 같은 옵션으로 바꿔도(불량 교환) 새 물건이 나가야 하므로 재고를 본다
  if (candidate.stock < original.quantity) return { ok: false, code: 'OUT_OF_STOCK' };
  return { ok: true };
}

export const EXCHANGE_OPTION_MESSAGE: Readonly<Record<Exclude<ExchangeOptionCheck, { ok: true }>['code'], string>> = {
  DIFFERENT_PRODUCT: '같은 상품의 옵션으로만 바꿀 수 있습니다.',
  PRICE_DIFFERS: '가격이 다른 옵션으로는 바꿀 수 없습니다. 반품 후 새로 주문해 주세요.',
  INACTIVE: '판매하지 않는 옵션입니다.',
  OUT_OF_STOCK: '바꿀 옵션의 재고가 모자랍니다.',
};
