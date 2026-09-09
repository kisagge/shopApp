import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { MAX_COMPARE, canAddToCompare } from '@shop/core';

/**
 * 견주려고 담아 둔 상품.
 *
 * **기기에만 남긴다** — 최근 본 상품과 같은 결이다. 로그인하지 않아도
 * 동작해야 하고, 서버에 남길 값어치가 있는 기록도 아니다.
 *
 * slug 와 함께 **갈래와 이름도 들고 있다.**
 *
 * 갈래는 담을 수 있는지(같은 갈래인지)를 담기 전에 판단하는 데 쓴다. 그때마다
 * 서버에 물으면 체크 하나 누를 때마다 왕복이 생긴다.
 *
 * 이름은 아래 띠에 보여 주려고 들고 있다. 최근 본 상품이 slug 만 들고 있는
 * 것과 다른 판단인데, **이름은 값처럼 상하지 않기 때문이다** — 어제 본 가격이
 * 오늘 남아 있으면 거짓말이 되지만, 상품명이 하루 늦은 것은 그렇지 않다.
 * 게다가 비교표 자체는 이 값을 쓰지 않고 서버에서 다시 읽는다.
 */
export interface CompareEntry {
  readonly slug: string;
  readonly categorySlug: string;
  readonly name: string;
}

interface CompareState {
  items: CompareEntry[];
  /** 담기·빼기를 한 동작으로 둔다. 체크박스 하나가 두 뜻을 갖는다. */
  toggle: (entry: CompareEntry) => void;
  remove: (slug: string) => void;
  clear: () => void;
}

export const useCompare = create<CompareState>()(
  persist(
    (set) => ({
      items: [],
      toggle: (entry) =>
        set((s) => {
          if (s.items.some((i) => i.slug === entry.slug)) {
            return { items: s.items.filter((i) => i.slug !== entry.slug) };
          }
          // 담을 수 없으면 **아무것도 하지 않는다.** 왜 안 되는지는 화면이 말한다.
          if (!canAddToCompare(s.items, entry)) return s;
          return { items: [...s.items, entry] };
        }),
      remove: (slug) => set((s) => ({ items: s.items.filter((i) => i.slug !== slug) })),
      clear: () => set({ items: [] }),
    }),
    {
      name: 'shop.compare',
      storage: createJSONStorage(() => localStorage),
      /*
       * 저장된 값이 상한을 넘어 있을 수 있다 — 상한을 줄이는 날이 오면
       * 어제 담아 둔 다섯 개가 그대로 살아난다. 읽을 때 잘라 둔다.
       */
      merge: (persisted, current) => {
        const saved = (persisted as { items?: CompareEntry[] } | null)?.items ?? [];
        return { ...current, items: saved.slice(0, MAX_COMPARE) };
      },
    },
  ),
);
