import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { normalizeSearchTerm } from '@shop/core';

/**
 * 최근 검색어.
 *
 * 검색은 이 가게에서 가장 많이 쓰는 입구인데(자동완성·면 좁히기·트라이그램 색인까지 있다) 정작 **방금 무엇을
 * 찾았는지는 기억하지 않았다.** 한 글자 고쳐 다시 찾으려면 처음부터 다시 쳐야 했다.
 *
 * **기기에만 남긴다**(최근 본 상품과 같은 판단). 서버로 보내지 않으니 분석 동의와 무관하고, 로그인하지 않아도
 * 되며, 지우고 싶으면 그 자리에서 지울 수 있다. 검색어는 방문 기록보다 더 사적인 것이 섞이기 쉬운 값이라
 * (증상·선물 받을 사람·브랜드 취향) 더욱 그렇다.
 *
 * **다듬은 꼴로 담는다.** `코트  ` 와 `코트` 가 두 줄이 되면 목록이 금방 같은 말로 찬다. 다듬는 규칙은 core 가
 * 쥔다(`normalizeSearchTerm`) — 검색이 무엇을 받아 주는지를 여기서 또 정하면 두 곳이 갈린다.
 */

/** 들고 있을 개수. 화면에는 이보다 적게 보여도 된다. */
export const MAX_RECENT_SEARCHES = 10;

/**
 * 목록 맨 앞에 넣는다.
 *
 * 같은 말을 다시 찾으면 줄이 늘지 않고 **자리만 앞으로 옮긴다** — 같은 검색어가 두 번 보이면
 * "최근 찾은" 이 아니라 "찾은 횟수" 가 된다(최근 본 상품과 같은 규칙).
 *
 * **검색이 받아 주지 않는 말은 담지 않는다.** 한 글자나 빈 글자를 담아 두면 눌러도 결과 화면이
 * "더 치세요" 를 띄운다 — 눌러서 아무 데도 못 가는 줄을 남기지 않는다.
 */
export function pushRecentSearch(
  terms: readonly string[],
  raw: string,
  max = MAX_RECENT_SEARCHES,
): string[] {
  const term = normalizeSearchTerm(raw);
  if (term === null) return [...terms];
  return [term, ...terms.filter((t) => t !== term)].slice(0, max);
}

interface RecentSearchState {
  terms: string[];
  record: (raw: string) => void;
  /** 한 줄만 지운다 — 남기고 싶은 것까지 함께 지우게 하지 않는다 */
  remove: (term: string) => void;
  clear: () => void;
}

export const useRecentSearches = create<RecentSearchState>()(
  persist(
    (set) => ({
      terms: [],
      record: (raw) => set((s) => ({ terms: pushRecentSearch(s.terms, raw) })),
      remove: (term) => set((s) => ({ terms: s.terms.filter((t) => t !== term) })),
      clear: () => set({ terms: [] }),
    }),
    {
      name: 'shop.recent-searches',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
