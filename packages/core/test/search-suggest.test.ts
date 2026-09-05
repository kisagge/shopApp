import { describe, it, expect } from 'vitest';
import {
  canSuggest, SUGGEST_MIN_LENGTH, popularTerms, POPULAR_MIN_SESSIONS,
} from '../src/search-suggest';

describe('자동완성을 언제 시작하는가', () => {
  it('너무 짧으면 시작하지 않는다 — 한 글자로는 카탈로그 절반이 걸린다', () => {
    expect(canSuggest('코')).toBe(false);
    expect(canSuggest('코트')).toBe(true);
  });

  it('공백만 친 것은 검색어가 아니다', () => {
    expect(canSuggest('   ')).toBe(false);
    expect(canSuggest(' 코 ')).toBe(false);
  });

  it('기준 길이는 한 곳에서 온다', () => {
    expect(canSuggest('가'.repeat(SUGGEST_MIN_LENGTH))).toBe(true);
    expect(canSuggest('가'.repeat(SUGGEST_MIN_LENGTH - 1))).toBe(false);
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
