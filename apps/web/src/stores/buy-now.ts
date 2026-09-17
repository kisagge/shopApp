import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { MAX_QUANTITY } from '@shop/core';
import type { CartItem } from '~/stores/cart';

/**
 * **바로 구매할 것 하나.**
 *
 * 상품 화면의 "바로 구매" 는 한동안 눌러도 아무 일도 없었다 — 단추만 있고 동작이 없었다.
 * 붙이면서 **장바구니를 건드리지 않기로** 했다. 결제 화면은 장바구니의 "고른 줄" 을 사고,
 * 주문 뒤에는 산 줄을 장바구니에서 지운다. 바로 구매를 장바구니에 얹어 처리하면
 * · 담아 두고 고르지 않은 다른 줄의 선택을 바꿔야 하고(돌아가 보면 체크가 풀려 있다)
 * · 이미 담아 둔 같은 옵션이 주문 뒤에 함께 사라진다.
 * 그래서 따로 둔다. 결제 화면은 `?now=1` 일 때 이것 하나를 산다.
 *
 * **탭에만 남는다(sessionStorage).** 로그인하러 갔다 오거나 결제창에 다녀와도 남아 있어야
 * 하고, 다른 탭이나 다음 날까지 남으면 엉뚱한 것을 사게 된다.
 */
interface BuyNowState {
  item: CartItem | null;
  set: (item: Omit<CartItem, 'quantity' | 'selected'>, quantity: number) => void;
  clear: () => void;
}

export const useBuyNowStore = create<BuyNowState>()(
  persist(
    (set) => ({
      item: null,
      set: (item, quantity) =>
        set({
          item: { ...item, quantity: Math.min(MAX_QUANTITY, Math.max(1, Math.trunc(quantity))), selected: true },
        }),
      clear: () => set({ item: null }),
    }),
    {
      name: 'shop.buy-now',
      version: 1,
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);
