/**
 * 재입고 알림 정책.
 *
 * 순수 함수만 둔다. I/O 없음.
 */

/** 한 사람이 걸어 둘 수 있는 알림 수 */
export const MAX_RESTOCK_SUBSCRIPTIONS = 30;

export interface VariantAvailability {
  readonly stock: number;
  readonly isActive: boolean;
  /** 상품이 팔 수 있는 상태인가 (게시됨·삭제 안 됨·가맹점 정상) */
  readonly productSellable: boolean;
}

export type RestockEligibility =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: string; readonly message: string };

/**
 * 이 옵션에 알림을 걸 수 있는가.
 *
 * **재고가 있으면 걸 수 없다.** 지금 살 수 있는 것에 "들어오면 알려 달라" 는
 * 말이 안 되고, 그렇게 걸어 두면 영원히 안 울리는 알림이 쌓인다.
 *
 * **판매를 내린 상품에도 걸 수 없다.** 다시 올릴지 알 수 없는데 기다리게
 * 하면 안 된다 — 알림을 걸었다는 것 자체가 "언젠가 온다" 는 약속이 된다.
 */
export function checkRestockEligibility(v: VariantAvailability): RestockEligibility {
  if (!v.productSellable) {
    return { ok: false, code: 'NOT_SELLABLE', message: '판매하지 않는 상품입니다.' };
  }
  if (!v.isActive) {
    return { ok: false, code: 'VARIANT_INACTIVE', message: '판매하지 않는 옵션입니다.' };
  }
  if (v.stock > 0) {
    return { ok: false, code: 'IN_STOCK', message: '지금 구매할 수 있습니다.' };
  }
  return { ok: true };
}

/**
 * 재고가 없다가 생겼는가.
 *
 * 알림은 이 순간에만 보낸다. "재고가 0보다 크다" 로 판단하면 재고를
 * 10에서 8로 줄이는 평범한 수정에도 알림이 나간다.
 */
export function becameAvailable(before: number, after: number): boolean {
  return before <= 0 && after > 0;
}
