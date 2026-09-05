import { describe, it, expect } from 'vitest';
import {
  FACET_GROUP, FACET_KEYS, MAX_FACET_VALUES,
  normalizeFacetValues, hasFacets, EMPTY_FACETS,
} from '../src/facet';

describe('좁혀 보기 축', () => {
  it('주소에는 영문 열쇠, DB 에는 한글 그룹 이름', () => {
    // 열쇠까지 한글로 두면 주소가 인코딩돼 통째로 읽히지 않는다
    expect(FACET_KEYS).toEqual(['color', 'size']);
    expect(FACET_GROUP.color).toBe('색상');
    expect(FACET_GROUP.size).toBe('사이즈');
  });
});

describe('들어온 값 다듬기', () => {
  it('같은 값이 두 번 오면 한 번으로 본다', () => {
    expect(normalizeFacetValues(['블랙', '블랙', '차콜'])).toEqual(['블랙', '차콜']);
  });

  it('앞뒤 공백을 떼고 빈 값은 버린다', () => {
    expect(normalizeFacetValues([' M ', '', '  ', 'L'])).toEqual(['M', 'L']);
  });

  it('개수를 자른다 — 주소로 IN 절을 부풀릴 수 있다', () => {
    const many = Array.from({ length: MAX_FACET_VALUES + 5 }, (_, i) => `v${i}`);
    expect(normalizeFacetValues(many)).toHaveLength(MAX_FACET_VALUES);
  });

  it('고른 순서를 지킨다', () => {
    expect(normalizeFacetValues(['L', 'S', 'M'])).toEqual(['L', 'S', 'M']);
  });
});

describe('그릴지 말지', () => {
  it('고를 것이 하나도 없으면 자리를 그리지 않는다', () => {
    expect(hasFacets(EMPTY_FACETS)).toBe(false);
  });

  it('한 축이라도 있으면 그린다', () => {
    expect(hasFacets({ color: [], size: [{ value: 'M', swatchHex: null }] })).toBe(true);
  });
});
