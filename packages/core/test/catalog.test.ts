import { describe, it, expect } from 'vitest';
import {
  normalizeSearchTerm, normalizePriceRange, emptyResultReason,
  isProductSort, PRODUCT_SORT, MIN_SEARCH_LENGTH, sellingPriceOf,
} from '../src/catalog';

describe('검색어 정규화', () => {
  it('앞뒤 공백을 자른다', () => {
    expect(normalizeSearchTerm('  울 코트  ')).toBe('울 코트');
  });

  it('가운데 연속 공백을 하나로 줄인다', () => {
    expect(normalizeSearchTerm('울    코트')).toBe('울 코트');
  });

  /*
   * 예전에는 한 글자를 전부 거절했다. 근거는 "카탈로그 전체가 걸린다" 였는데
   * **그건 라틴 문자 이야기였다.** 한글은 한 글자가 낱말이라, 운영에서
   * "울" 을 찾으면 상품 서른넷 중 여덟이 걸려야 하는데 0건이 나갔다.
   */
  it('한글 한 글자는 낱말이라 받는다', () => {
    expect(normalizeSearchTerm('울')).toBe('울');
    expect(normalizeSearchTerm(' 코 ')).toBe('코');
  });

  it('한자와 가나도 한 글자로 뜻이 선다', () => {
    expect(normalizeSearchTerm('麻')).toBe('麻');
    expect(normalizeSearchTerm('綿')).toBe('綿');
  });

  it('라틴 한 글자는 여전히 받지 않는다 — 거의 모든 것에 걸린다', () => {
    expect(normalizeSearchTerm('a')).toBeNull();
    expect(normalizeSearchTerm('7')).toBeNull();
  });

  it('낱자는 받지 않는다 — 조합 중이라는 뜻이지 낱말이 아니다', () => {
    /*
     * 한글 자판에서 "코" 를 치는 도중에 ㅋ 가 지나간다. 받으면 글자를 치는
     * 동안 뜻 없는 검색이 계속 나간다.
     */
    expect(normalizeSearchTerm('ㅋ')).toBeNull();
    expect(normalizeSearchTerm('ㅏ')).toBeNull();
  });

  it('빈 값은 받지 않는다', () => {
    expect(normalizeSearchTerm('')).toBeNull();
    expect(normalizeSearchTerm('   ')).toBeNull();
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

  it('평점순은 저장된 평균(ratingScore)으로 정렬한다', () => {
    // 평균은 파생값이라 DB 가 정렬할 수 없다. 리뷰가 그 값을 갱신한다.
    expect(isProductSort('rating')).toBe(true);
  });
});

describe('빈 결과 안내', () => {
  it('검색어보다 필터를 먼저 짚는다', () => {
    // "결과 없음" 만 보여 주면 검색어를 의심하지만 실제로는 필터가 원인일 때가 많다
    expect(emptyResultReason({ hasQuery: true, hasPriceRange: true, hasCategory: false })).toBe(
      'widen_price',
    );
  });

  it('둘 다 걸었으면 둘 다 짚는다', () => {
    expect(emptyResultReason({ hasQuery: false, hasPriceRange: true, hasCategory: true })).toBe(
      'widen_both',
    );
  });

  it('필터가 카테고리뿐일 수도 있다', () => {
    expect(emptyResultReason({ hasQuery: false, hasPriceRange: false, hasCategory: true })).toBe(
      'widen_category',
    );
  });

  it('검색어뿐이면 검색어를 의심하라고 한다', () => {
    expect(emptyResultReason({ hasQuery: true, hasPriceRange: false, hasCategory: false })).toBe(
      'other_term',
    );
  });

  it('아무 조건도 없으면 상품이 없는 것이다', () => {
    expect(emptyResultReason({ hasQuery: false, hasPriceRange: false, hasCategory: false })).toBe(
      'no_products',
    );
  });
});


describe('파는 가격', () => {
  it('할인가가 있으면 그것이 파는 가격이다', () => {
    expect(sellingPriceOf({ listPrice: 413_000, salePrice: 289_000 })).toBe(289_000);
  });

  it('할인가가 없으면 정가로 판다', () => {
    // null 을 0 으로 접으면 그 상품은 가격 필터에서 통째로 사라진다.
    expect(sellingPriceOf({ listPrice: 198_000, salePrice: null })).toBe(198_000);
  });

  it('무료 상품이라도 0 을 정가로 되돌리지 않는다', () => {
    // ?? 가 아니라 || 를 쓰면 0원이 정가로 뒤집힌다.
    expect(sellingPriceOf({ listPrice: 10_000, salePrice: 0 })).toBe(0);
  });
});
