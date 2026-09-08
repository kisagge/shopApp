import { describe, it, expect } from 'vitest';
import {
  FACET_GROUP, FACET_KEYS, MAX_FACET_VALUES,
  normalizeFacetValues, hasFacets, EMPTY_FACETS, sortFacetValues,
  type FacetKey, type FacetValue,
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

describe('sortFacetValues — 매대 전체의 차례', () => {
  const v = (value: string): FacetValue => ({ value, swatchHex: null });
  const order = (values: readonly string[], key: FacetKey = 'size') =>
    sortFacetValues(key, values.map(v)).map((f) => f.value);

  it('옷 사이즈는 작은 것부터 큰 것으로 간다', () => {
    // 가나다순이면 L · M · S · XL 이 된다. 그건 아무 뜻이 없다.
    expect(order(['XL', 'M', 'S', 'L'])).toEqual(['S', 'M', 'L', 'XL']);
  });

  it('신발 치수는 수로 견준다', () => {
    // 글자로 견주면 '90' 이 '250' 앞에 온다.
    expect(order(['270', '250', '90', '260'])).toEqual(['90', '250', '260', '270']);
  });

  it('FREE 는 맨 뒤에 둔다', () => {
    // 크기가 아니므로 사이에 끼면 흐름이 끊긴다.
    expect(order(['FREE', 'M', 'S'])).toEqual(['S', 'M', 'FREE']);
  });

  it('글자 치수와 수 치수가 섞여도 나뉘어 놓인다', () => {
    /*
     * 실제로 브랜드 화면에 뜬 차례가 `250 FREE M S 260 L 270 XL` 이었다.
     * 상품마다 매긴 순번을 매대 전체에 그대로 쓴 탓이다.
     */
    expect(order(['250', 'FREE', 'M', 'S', '260', 'L', '270', 'XL'])).toEqual([
      'S', 'M', 'L', 'XL', '250', '260', '270', 'FREE',
    ]);
  });

  it('색은 가나다순으로 둔다', () => {
    // 정해진 차례가 없다. 아무 순서보다 늘 같은 순서가 낫다.
    expect(order(['차콜', '검정', '아이보리'], 'color')).toEqual(['검정', '아이보리', '차콜']);
  });

  it('원래 목록을 건드리지 않는다', () => {
    const given = [v('XL'), v('S')];
    sortFacetValues('size', given);
    expect(given.map((f) => f.value)).toEqual(['XL', 'S']);
  });

  it('스와치 색을 잃지 않는다', () => {
    const sorted = sortFacetValues('color', [
      { value: '차콜', swatchHex: '#36454F' },
      { value: '검정', swatchHex: '#000000' },
    ]);
    expect(sorted).toEqual([
      { value: '검정', swatchHex: '#000000' },
      { value: '차콜', swatchHex: '#36454F' },
    ]);
  });
});
