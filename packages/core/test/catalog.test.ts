import { describe, it, expect } from 'vitest';
import {
  normalizeSearchTerm, normalizePriceRange, emptyResultReason, searchWords, MAX_SEARCH_WORDS,
  isProductSort, PRODUCT_SORT, MIN_SEARCH_LENGTH, sellingPriceOf,
  PRICE_BUCKET, resolvePriceRange,
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

describe('가격 구간 프리셋', () => {
  it('구간이 매대를 빠짐없이 덮는다', () => {
    /*
     * 칸 사이가 벌어지면 그 값의 상품은 어느 칩으로도 못 찾는다.
     * 겹치면 같은 상품이 두 칩에 나온다. 둘 다 사용자는 이유를 모른다.
     */
    for (const [i, bucket] of PRICE_BUCKET.entries()) {
      const next = PRICE_BUCKET[i + 1];
      if (next === undefined) {
        expect(bucket.max, '마지막 칸은 위가 열려 있어야 한다').toBeNull();
        continue;
      }
      expect(bucket.max, `${bucket.id} 는 끝이 있어야 한다`).not.toBeNull();
      expect(next.min).toBe(bucket.max! + 1);
    }
    expect(PRICE_BUCKET[0]?.min, '첫 칸은 아래가 열려 있어야 한다').toBeNull();
  });

  it('손으로 친 숫자가 프리셋을 이긴다', () => {
    // 눌린 칩과 다른 범위가 걸려 있으면 화면이 거짓말을 한다
    const r = resolvePriceRange({ minPrice: 50_000, price: 'over-300k' });
    expect(r).toEqual({ min: 50_000, max: null, bucket: null });
  });

  it('프리셋만 있으면 그 범위를 편다', () => {
    expect(resolvePriceRange({ price: '100k-200k' })).toEqual({
      min: 100_000,
      max: 199_999,
      bucket: '100k-200k',
    });
  });

  it('모르는 이름은 없는 것과 같다', () => {
    // 주소는 사용자가 고칠 수 있다. 오류 화면을 띄울 일이 아니다.
    expect(resolvePriceRange({ price: '공짜' })).toEqual({ min: null, max: null, bucket: null });
  });

  it('아무것도 없으면 범위도 없다', () => {
    expect(resolvePriceRange({})).toEqual({ min: null, max: null, bucket: null });
  });
});

describe('searchWords — 낱말이 붙어 있지 않아도 찾는다', () => {
  it('빈칸으로 쪼갠다', () => {
    /*
     * 예전에는 검색어 전체를 한 덩어리로 봤다. "블렌드 코트" 는 1건을 찾는데
     * **"울 코트" 는 0건**이었다 — 두 낱말이 다 있는데 사이에 다른 말이
     * 끼어 있었기 때문이다. 한국어로 물건을 찾을 때 아주 자연스러운 말이
     * 0건이면 손님은 안 파는 물건이라고 읽는다.
     */
    expect(searchWords('울 코트')).toEqual(['울', '코트']);
    expect(searchWords('코트 울')).toEqual(['코트', '울']);
  });

  it('소문자로 맞춘다 — searchText 가 소문자로 저장돼 있다', () => {
    expect(searchWords('MOOR 니트')).toEqual(['moor', '니트']);
  });

  it('한 낱말이면 그대로다', () => {
    expect(searchWords('코트')).toEqual(['코트']);
  });

  it('한 글자는 버리되, 그 한 글자로 뜻이 서면 남긴다', () => {
    // "울" 은 낱말이고 "s" 는 아니다 — normalizeSearchTerm 과 같은 잣대다
    expect(searchWords('울 코트')).toContain('울');
    expect(searchWords('s coat')).toEqual(['coat']);
  });

  it('낱말이 너무 많으면 잘라 낸다 — 조건이 무한정 늘지 않게', () => {
    const many = Array.from({ length: 20 }, (_, i) => `낱말${i}`).join(' ');
    expect(searchWords(many)).toHaveLength(MAX_SEARCH_WORDS);
  });

  it('남는 낱말이 없으면 검색어를 통째로 쓴다', () => {
    // 빈손으로 답하지 않는다 — 무엇이든 찾아 보려던 사람이다
    expect(searchWords('a b')).toEqual(['a b']);
  });
});
