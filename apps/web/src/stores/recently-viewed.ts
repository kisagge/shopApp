import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * 최근 본 상품.
 *
 * **분석 이벤트로 만들지 않았다.** `view_item` 은 이미 쌓고 있지만 그것은
 * 분석 동의를 켠 사람의 것만 남는다 — 기본값이 꺼짐이라, 이벤트에서 끌어오면
 * 대부분의 방문자에게 이 자리가 늘 비어 있게 된다. 방문 기록을 되짚어 주는
 * 편의 기능이 분석 동의에 매달릴 이유가 없다.
 *
 * 그래서 **기기에만 남긴다.** 서버로 보내지 않으니 동의와 무관하고,
 * 로그인하지 않아도 동작하며, 지우고 싶으면 그 자리에서 지울 수 있다.
 *
 * 담아 두는 것은 **slug 뿐이다.** 이름과 가격까지 넣어 두면 화면은 빨라지지만
 * 어제 본 가격이 그대로 남는다 — 할인이 끝났는데 할인가가 보이는 목록이 된다.
 * 장바구니가 담을 때의 금액을 표시용으로만 쓰고 결제 금액은 서버에 다시
 * 묻는 것과 같은 이유다.
 */

/** 들고 있을 개수. 화면에는 이보다 적게 보여도 된다. */
export const MAX_RECENT = 12;

/**
 * 목록 맨 앞에 넣는다.
 *
 * 이미 본 상품을 다시 보면 줄이 늘지 않고 **자리만 앞으로 옮긴다** — 같은
 * 상품이 두 번 보이면 "최근 본" 이 아니라 "본 횟수" 가 된다.
 */
export function pushRecent(
  slugs: readonly string[],
  slug: string,
  max = MAX_RECENT,
): string[] {
  return [slug, ...slugs.filter((s) => s !== slug)].slice(0, max);
}

interface RecentlyViewedState {
  slugs: string[];
  record: (slug: string) => void;
  clear: () => void;
}

export const useRecentlyViewed = create<RecentlyViewedState>()(
  persist(
    (set) => ({
      slugs: [],
      record: (slug) => set((s) => ({ slugs: pushRecent(s.slugs, slug) })),
      clear: () => set({ slugs: [] }),
    }),
    {
      name: 'shop.recently-viewed',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
