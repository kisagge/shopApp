import { describe, it, expect, beforeEach } from 'vitest';
import {
  pushRecentSearch, useRecentSearches, MAX_RECENT_SEARCHES,
} from '~/stores/recent-searches';
import { useRecentlyViewed } from '~/stores/recently-viewed';

/**
 * 최근 검색어를 기기에 담는 규칙.
 *
 * 검색은 이 가게에서 가장 많이 쓰는 입구인데 **방금 무엇을 찾았는지는 기억하지 않았다.** 한 글자 고쳐 다시
 * 찾으려면 처음부터 다시 쳐야 했다.
 *
 * 담는 규칙 셋이 조용히 틀릴 수 있다.
 *
 * - **같은 말을 두 줄로 두면** "최근 찾은" 이 아니라 "찾은 횟수" 가 된다.
 * - **다듬지 않고 담으면** `코트  ` 와 `코트` 가 두 줄이 되어 목록이 금방 같은 말로 찬다.
 * - **검색이 안 받아 주는 말을 담으면** 눌러도 결과 화면이 "더 치세요" 를 띄운다 — 아무 데도 못 가는 줄이다.
 */

beforeEach(() => useRecentSearches.setState({ terms: [] }));

describe('맨 앞에 넣는다', () => {
  it('새 말은 앞으로', () => {
    expect(pushRecentSearch(['니트'], '코트')).toEqual(['코트', '니트']);
  });

  it('같은 말을 다시 찾으면 줄이 늘지 않고 자리만 앞으로', () => {
    expect(pushRecentSearch(['니트', '코트', '가방'], '코트')).toEqual(['코트', '니트', '가방']);
  });

  it(`${MAX_RECENT_SEARCHES}개가 넘으면 오래된 것이 밀려난다`, () => {
    const full = Array.from({ length: MAX_RECENT_SEARCHES }, (_, i) => `말${i}`);
    const next = pushRecentSearch(full, '새말');

    expect(next).toHaveLength(MAX_RECENT_SEARCHES);
    expect(next[0]).toBe('새말');
    expect(next).not.toContain(`말${MAX_RECENT_SEARCHES - 1}`);
  });

  it('받은 목록을 고치지 않는다 — 스토어 밖에서도 쓸 수 있어야 한다', () => {
    const before = ['니트'];
    pushRecentSearch(before, '코트');
    expect(before).toEqual(['니트']);
  });
});

describe('다듬어서 담는다', () => {
  it('앞뒤 빈칸을 떼고, 같은 말로 본다', () => {
    expect(pushRecentSearch(['코트'], '  코트 ')).toEqual(['코트']);
  });

  it('가운데 빈칸이 여러 개면 하나로 줄인다', () => {
    expect(pushRecentSearch([], '울   코트')).toEqual(['울 코트']);
  });

  it('대소문자는 그대로 둔다 — 사람이 친 꼴로 보여 준다', () => {
    expect(pushRecentSearch([], 'STUDIO NOON')).toEqual(['STUDIO NOON']);
  });
});

describe('검색이 받아 주지 않는 말', () => {
  it('빈 글자는 담지 않는다', () => {
    expect(pushRecentSearch(['코트'], '   ')).toEqual(['코트']);
  });

  it('로마자 한 글자는 담지 않는다 — 눌러도 결과 화면이 더 치라고 한다', () => {
    expect(pushRecentSearch(['코트'], 'a')).toEqual(['코트']);
  });

  it('한글 한 음절은 담는다 — 검색이 그것은 받아 준다', () => {
    // 다듬는 규칙을 여기서 또 정하지 않고 core 에 묻는다. 그래서 이 예외가 저절로 따라온다
    expect(pushRecentSearch([], '컵')).toEqual(['컵']);
  });
});

describe('스토어', () => {
  it('찾은 것을 적는다', () => {
    useRecentSearches.getState().record('코트');
    expect(useRecentSearches.getState().terms).toEqual(['코트']);
  });

  it('한 줄만 지운다 — 남기고 싶은 것은 남는다', () => {
    useRecentSearches.setState({ terms: ['코트', '니트', '가방'] });
    useRecentSearches.getState().remove('니트');
    expect(useRecentSearches.getState().terms).toEqual(['코트', '가방']);
  });

  it('없는 말을 지워도 멀쩡하다', () => {
    useRecentSearches.setState({ terms: ['코트'] });
    useRecentSearches.getState().remove('없는말');
    expect(useRecentSearches.getState().terms).toEqual(['코트']);
  });

  it('전부 지운다', () => {
    useRecentSearches.setState({ terms: ['코트', '니트'] });
    useRecentSearches.getState().clear();
    expect(useRecentSearches.getState().terms).toEqual([]);
  });

  it('최근 본 상품과 서로 다른 기록이다 — 하나를 비워도 다른 하나는 남는다', () => {
    /*
     * 같은 자리에 담으면 검색 기록을 지운 사람의 **방문 기록까지 함께 사라진다.** 둘은 보여 주는
     * 자리도 지우는 단추도 따로이므로, 지운다는 말의 뜻도 따로여야 한다.
     */
    useRecentlyViewed.setState({ slugs: ['wool-coat'] });
    useRecentSearches.setState({ terms: ['코트'] });

    useRecentSearches.getState().clear();

    expect(useRecentSearches.getState().terms).toEqual([]);
    expect(useRecentlyViewed.getState().slugs, '방문 기록이 함께 지워졌다').toEqual(['wool-coat']);
  });
});
