import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { MAX_QUANTITY } from '@shop/core';

export interface CartItem {
  readonly variantId: string;
  readonly productId: string;
  readonly productName: string;
  readonly brand: string;
  readonly optionLabel: string;
  /** 정가. 취소선 표시용 */
  readonly listPrice: number;
  /** 담을 당시의 판매 단가. 표시용이고, 결제 금액은 서버가 다시 계산한다. */
  readonly salePrice: number;
  quantity: number;
  selected: boolean;
}

// 상한은 core 에 있다. 서버 병합도 같은 값을 써야 두 곳이 어긋나지 않는다.
export { MAX_QUANTITY };

interface CartState {
  items: CartItem[];
  add: (item: Omit<CartItem, 'quantity' | 'selected'>, quantity?: number) => void;
  remove: (variantId: string) => void;
  removeSelected: () => void;
  setQuantity: (variantId: string, quantity: number) => void;
  increment: (variantId: string) => void;
  decrement: (variantId: string) => void;
  toggleSelected: (variantId: string) => void;
  setAllSelected: (selected: boolean) => void;
  clear: () => void;
}

/**
 * 장바구니는 클라이언트 상태다 — 비로그인 사용자도 담을 수 있어야 하므로
 * localStorage에 남긴다. 다만 **금액은 여기서 계산하지 않는다**.
 * 표시용 계산조차 서버(/api/cart/quote)가 정한 값을 쓰고, 이 스토어는
 * 무엇을 몇 개 담았는지만 안다. 가격을 클라이언트가 정하면 조작 가능해진다.
 */
export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],

      add: (item, quantity = 1) =>
        set((s) => {
          const existing = s.items.find((i) => i.variantId === item.variantId);
          if (existing) {
            // 같은 옵션을 다시 담으면 줄을 늘리지 않고 수량만 올린다
            return {
              items: s.items.map((i) =>
                i.variantId === item.variantId
                  ? { ...i, quantity: Math.min(MAX_QUANTITY, i.quantity + quantity) }
                  : i,
              ),
            };
          }
          return {
            items: [
              ...s.items,
              { ...item, quantity: Math.min(MAX_QUANTITY, Math.max(1, quantity)), selected: true },
            ],
          };
        }),

      remove: (variantId) =>
        set((s) => ({ items: s.items.filter((i) => i.variantId !== variantId) })),

      removeSelected: () => set((s) => ({ items: s.items.filter((i) => !i.selected) })),

      setQuantity: (variantId, quantity) =>
        set((s) => ({
          items: s.items.map((i) =>
            i.variantId === variantId
              ? { ...i, quantity: Math.min(MAX_QUANTITY, Math.max(1, Math.trunc(quantity))) }
              : i,
          ),
        })),

      increment: (variantId) =>
        set((s) => ({
          items: s.items.map((i) =>
            i.variantId === variantId
              ? { ...i, quantity: Math.min(MAX_QUANTITY, i.quantity + 1) }
              : i,
          ),
        })),

      // 1개 아래로는 내리지 않는다. 0개는 "삭제"라는 별도 동작이어야 한다.
      decrement: (variantId) =>
        set((s) => ({
          items: s.items.map((i) =>
            i.variantId === variantId ? { ...i, quantity: Math.max(1, i.quantity - 1) } : i,
          ),
        })),

      toggleSelected: (variantId) =>
        set((s) => ({
          items: s.items.map((i) =>
            i.variantId === variantId ? { ...i, selected: !i.selected } : i,
          ),
        })),

      setAllSelected: (selected) =>
        set((s) => ({ items: s.items.map((i) => ({ ...i, selected })) })),

      clear: () => set({ items: [] }),
    }),
    {
      name: 'shop.cart',
      version: 1,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

/** 선택된 항목만 주문 대상이다 */
export const selectSelectedItems = (s: CartState): CartItem[] => s.items.filter((i) => i.selected);

export const selectItemCount = (s: CartState): number => s.items.length;

export const selectAllSelected = (s: CartState): boolean =>
  s.items.length > 0 && s.items.every((i) => i.selected);
