import { describe, it, expect } from 'vitest';
import { mergeRecommendations, worthShowing, MIN_RECOMMENDATIONS } from '../src/recommend';

const items = (...ids: string[]) => ids.map((id) => ({ id }));

describe('추천 목록 만들기', () => {
  it('기록에서 나온 것이 앞이다', () => {
    const r = mergeRecommendations({
      primary: items('a', 'b'),
      fallback: items('x', 'y'),
      excludeId: 'me',
      limit: 4,
    });
    expect(r.map((i) => i.id)).toEqual(['a', 'b', 'x', 'y']);
  });

  it('기록이 모자라면 뒤에서 채운다 — 첫날에도 빈칸이 아니어야 한다', () => {
    const r = mergeRecommendations({
      primary: [],
      fallback: items('x', 'y', 'z'),
      excludeId: 'me',
      limit: 3,
    });
    expect(r.map((i) => i.id)).toEqual(['x', 'y', 'z']);
  });

  it('자기 자신은 추천하지 않는다', () => {
    const r = mergeRecommendations({
      primary: items('me', 'a'),
      fallback: items('me', 'b'),
      excludeId: 'me',
      limit: 5,
    });
    expect(r.map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('같은 상품이 양쪽에 있어도 한 번만 나온다', () => {
    // 함께 본 상품이 같은 카테고리인 것은 흔하다
    const r = mergeRecommendations({
      primary: items('a'),
      fallback: items('a', 'b'),
      excludeId: 'me',
      limit: 5,
    });
    expect(r.map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('한도를 넘지 않는다', () => {
    const r = mergeRecommendations({
      primary: items('a', 'b', 'c'),
      fallback: items('x', 'y'),
      excludeId: 'me',
      limit: 2,
    });
    expect(r).toHaveLength(2);
  });

  it('한도가 0 이면 아무것도 주지 않는다', () => {
    expect(
      mergeRecommendations({ primary: items('a'), fallback: [], excludeId: 'me', limit: 0 }),
    ).toEqual([]);
  });

  it('둘 다 비면 빈 목록이다', () => {
    expect(
      mergeRecommendations({ primary: [], fallback: [], excludeId: 'me', limit: 5 }),
    ).toEqual([]);
  });
});

describe('보여 줄 만한가', () => {
  it('최소치를 못 채우면 그리지 않는다', () => {
    // 한두 개만 뜨는 줄은 추천이 아니라 빈자리처럼 보인다
    expect(worthShowing(MIN_RECOMMENDATIONS - 1)).toBe(false);
    expect(worthShowing(MIN_RECOMMENDATIONS)).toBe(true);
  });
});
