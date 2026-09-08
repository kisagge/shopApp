import { describe, it, expect } from 'vitest';
import {
  canSuggest, SUGGEST_MIN_LENGTH, popularTerms, POPULAR_MIN_SESSIONS,
} from '../src/search-suggest';
import { normalizeSearchTerm } from '../src/catalog';

describe('자동완성을 언제 시작하는가', () => {
  it('로마자 한 글자로는 시작하지 않는다 — 카탈로그 절반이 걸린다', () => {
    // 서른넷 중 열아홉이 'a' 를 문다. 그건 제안이 아니라 목록이다.
    expect(canSuggest('a')).toBe(false);
    expect(canSuggest('wo')).toBe(true);
  });

  it('한글 한 음절로는 시작한다 — 검색과 답이 같아야 한다', () => {
    /*
     * 여기가 어긋나 있었다. 검색은 `울` 로 여덟 개를 찾는데 자동완성은
     * 아무것도 내놓지 않아, 치는 동안에는 안 파는 물건처럼 보였다.
     * 두 문지기는 서로 다른 질문에 답하지만, **한 음절이 낱말이라는
     * 사실에는 다르게 답하면 안 된다.**
     */
    expect(canSuggest('울')).toBe(true);
    expect(normalizeSearchTerm('울')).not.toBeNull();
    expect(canSuggest('코')).toBe(true);
  });

  it('조합 중인 낱자는 아직 낱말이 아니다', () => {
    // 한글 자판에서 ㅋ 을 지나가는 것뿐이라, 받으면 뜻 없는 검색이 나간다
    expect(canSuggest('ㅋ')).toBe(false);
    expect(canSuggest('ㅇ')).toBe(false);
  });

  it('공백만 친 것은 검색어가 아니다', () => {
    expect(canSuggest('   ')).toBe(false);
    expect(canSuggest(' a ')).toBe(false);
  });

  it('한 글자에 대해 두 문지기의 답이 늘 같다', () => {
    /*
     * 문지기가 둘이면 언젠가 어긋난다 — 실제로 어긋나서, 검색은 찾는데
     * 자동완성만 조용한 상태가 한동안 있었다. 사람이 한 글자만 친 순간이
     * 정확히 그 어긋남이 보이는 자리라, 거기서만큼은 답이 같아야 한다.
     */
    const samples = [...'울코a1가한漢あア ㅋㅇ-'];
    for (const c of samples) {
      expect([c, canSuggest(c)]).toEqual([c, normalizeSearchTerm(c) !== null]);
    }
  });

  it('기준 길이는 한 곳에서 온다', () => {
    expect(canSuggest('a'.repeat(SUGGEST_MIN_LENGTH))).toBe(true);
    expect(canSuggest('a'.repeat(SUGGEST_MIN_LENGTH - 1))).toBe(false);
  });
});

describe('인기 검색어', () => {
  const stat = (term: string, sessions: number, hadResults = true) => ({
    term, sessions, hadResults,
  });

  it('결과가 없던 검색어는 권하지 않는다', () => {
    // 권한 대로 갔더니 아무것도 없는 경험이 가장 나쁘다
    const r = popularTerms([stat('없는것', 50, false), stat('코트', 5)], 10);
    expect(r).toEqual(['코트']);
  });

  it('한 사람이 여러 번 친 것은 인기가 아니다', () => {
    // 세션 수로 세므로, 한 세션에서 스무 번 쳐도 1이다
    const r = popularTerms([stat('헤맨말', 1), stat('코트', POPULAR_MIN_SESSIONS)], 10);
    expect(r).toEqual(['코트']);
  });

  it('받은 순서를 지킨다 — 정렬은 조회가 한다', () => {
    const r = popularTerms([stat('a', 9), stat('b', 5), stat('c', 4)], 10);
    expect(r).toEqual(['a', 'b', 'c']);
  });

  it('한도를 넘지 않는다', () => {
    const r = popularTerms([stat('a', 9), stat('b', 5), stat('c', 4)], 2);
    expect(r).toEqual(['a', 'b']);
  });

  it('아무것도 기준을 못 넘으면 빈 목록이다 — 없는 인기를 지어내지 않는다', () => {
    expect(popularTerms([stat('a', 1), stat('b', 2)], 10)).toEqual([]);
  });

  it('기준을 넘겨 받을 수 있다', () => {
    expect(popularTerms([stat('a', 1)], 10, 1)).toEqual(['a']);
  });
});
