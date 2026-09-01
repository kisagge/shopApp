import { describe, it, expect } from 'vitest';
import {
  normalizeSearchTerm, normalizePriceRange, emptyResultHint,
  isProductSort, PRODUCT_SORT, MIN_SEARCH_LENGTH,
} from '../src/catalog';

describe('검색어 정규화', () => {
  it('앞뒤 공백을 자른다', () => {
    expect(normalizeSearchTerm('  울 코트  ')).toBe('울 코트');
  });

  it('가운데 연속 공백을 하나로 줄인다', () => {
    expect(normalizeSearchTerm('울    코트')).toBe('울 코트');
  });

  it('한 글자는 받지 않는다 — 카탈로그 전체가 걸린다', () => {
    expect(normalizeSearchTerm('울')).toBeNull();
    expect(normalizeSearchTerm(' 코 ')).toBeNull();
  });

  it(`${MIN_SEARCH_LENGTH}글자부터 받는다`, () => {
    expect(normalizeSearchTerm('코트')).toBe('코트');
  });

  it('공백만 있으면 null', () => {
    expect(normalizeSearchTerm('     ')).toBeNull();
  });

  it('지나치게 긴 입력은 잘라 낸다', () => {
    expect(normalizeSearchTerm('가'.repeat(200))).toHaveLength(60);
  });
});

describe('가격 범위', () => {
  it('둘 다 없으면 null 둘', () => {
    expect(normalizePriceRange({})).toEqual({ min: null, max: null });
  });

  it('뒤집힌 범위는 거절하지 않고 바로잡는다', () => {
    // 슬라이더나 두 칸 입력에서 흔히 나오는 상태다.
    // 막으면 사용자는 왜 결과가 없는지 알 수 없다.
    expect(normalizePriceRange({ min: 100_000, max: 50_000 }))
      .toEqual({ min: 50_000, max: 100_000 });
  });

  it('음수는 없는 것으로 본다', () => {
    expect(normalizePriceRange({ min: -1, max: 50_000 }))
      .toEqual({ min: null, max: 50_000 });
  });

  it('소수점은 버린다 — 원화에 소수는 없다', () => {
    expect(normalizePriceRange({ min: 1000.9 }).min).toBe(1000);
  });

  it('한쪽만 있어도 된다', () => {
    expect(normalizePriceRange({ min: 50_000 })).toEqual({ min: 50_000, max: null });
    expect(normalizePriceRange({ max: 50_000 })).toEqual({ min: null, max: 50_000 });
  });

  it('같은 값이면 그대로 둔다', () => {
    expect(normalizePriceRange({ min: 5000, max: 5000 })).toEqual({ min: 5000, max: 5000 });
  });
});

describe('정렬 값', () => {
  it('정의된 것만 받는다', () => {
    for (const s of PRODUCT_SORT) expect(isProductSort(s)).toBe(true);
    expect(isProductSort('random')).toBe(false);
  });

  it('평점순은 아직 없다 — 평균을 저장하지 않으면 DB 가 정렬할 수 없다', () => {
    expect(isProductSort('rating')).toBe(false);
  });
});

describe('빈 결과 안내', () => {
  it('필터를 걸었으면 그것부터 풀라고 한다', () => {
    // "결과 없음" 만 보여 주면 검색어를 의심하지만 실제로는 필터가 원인일 때가 많다
    expect(emptyResultHint({ hasQuery: true, hasPriceRange: true, hasCategory: false }))
      .toContain('가격 범위');
  });

  it('둘 다 걸었으면 둘 다 언급한다', () => {
    const hint = emptyResultHint({ hasQuery: false, hasPriceRange: true, hasCategory: true });
    expect(hint).toContain('가격 범위');
    expect(hint).toContain('카테고리');
  });

  it('검색어뿐이면 검색어를 의심하라고 한다', () => {
    expect(emptyResultHint({ hasQuery: true, hasPriceRange: false, hasCategory: false }))
      .toContain('검색어');
  });

  it('아무 조건도 없으면 상품이 없는 것이다', () => {
    expect(emptyResultHint({ hasQuery: false, hasPriceRange: false, hasCategory: false }))
      .toContain('등록된 상품이 없습니다');
  });
});
