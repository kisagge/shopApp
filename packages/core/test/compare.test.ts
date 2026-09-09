import { describe, it, expect } from 'vitest';
import {
  COMPARE_ROW, COMPARE_ERROR, MAX_COMPARE, MIN_COMPARE,
  compareError, canAddToCompare, rowDiffers, differingRows, bestInRow,
  type ComparableProduct,
} from '../src';

const p = (over: Partial<ComparableProduct> & { slug: string }): ComparableProduct => ({
  categorySlug: 'outer-coat',
  brand: '무어',
  price: 289_000,
  listPrice: 413_000,
  discountPercent: 30,
  rating: 4.5,
  reviewCount: 12,
  soldOut: false,
  freeShipping: true,
  options: { 색상: ['오트밀', '차콜'], 사이즈: ['S', 'M'] },
  ...over,
});

describe('견줄 수 있는 묶음', () => {
  it('하나만으로는 비교가 아니다 — 상세를 못생기게 다시 그린 것뿐이다', () => {
    expect(compareError([p({ slug: 'a' })])).toBe(COMPARE_ERROR.TOO_FEW);
    expect(compareError([])).toBe(COMPARE_ERROR.TOO_FEW);
  });

  it(`${MAX_COMPARE}개를 넘기지 않는다`, () => {
    const many = Array.from({ length: MAX_COMPARE + 1 }, (_, i) => p({ slug: `s${i}` }));
    expect(compareError(many)).toBe(COMPARE_ERROR.TOO_MANY);
  });

  /**
   * 코트와 니트를 나란히 놓으면 값과 평점이 나오기는 하는데, 그 숫자로 정할
   * 수 있는 것이 없다 — 애초에 둘 중 하나를 고르려던 것이 아니다.
   */
  it('갈래가 다르면 견주지 않는다', () => {
    expect(compareError([p({ slug: 'a' }), p({ slug: 'b', categorySlug: 'knit-crewneck' })]))
      .toBe(COMPARE_ERROR.MIXED_CATEGORY);
  });

  it(`같은 갈래 ${MIN_COMPARE}개면 견준다`, () => {
    expect(compareError([p({ slug: 'a' }), p({ slug: 'b' })])).toBeNull();
  });
});

describe('담을 수 있는가', () => {
  const already = [{ slug: 'a', categorySlug: 'outer-coat' }];

  it('이미 담긴 것은 언제나 누를 수 있다 — 빼는 동작이다', () => {
    const full = Array.from({ length: MAX_COMPARE }, (_, i) => ({
      slug: `s${i}`, categorySlug: 'outer-coat',
    }));
    expect(canAddToCompare(full, { slug: 's0', categorySlug: 'outer-coat' })).toBe(true);
  });

  it('가득 차면 새것은 담기지 않는다', () => {
    const full = Array.from({ length: MAX_COMPARE }, (_, i) => ({
      slug: `s${i}`, categorySlug: 'outer-coat',
    }));
    expect(canAddToCompare(full, { slug: 'new', categorySlug: 'outer-coat' })).toBe(false);
  });

  it('다른 갈래는 담기지 않는다', () => {
    expect(canAddToCompare(already, { slug: 'b', categorySlug: 'knit-crewneck' })).toBe(false);
  });

  it('비어 있으면 어느 갈래든 첫 번째가 된다', () => {
    expect(canAddToCompare([], { slug: 'b', categorySlug: 'knit-crewneck' })).toBe(true);
  });
});

describe('다른 줄 가려내기', () => {
  it('전부 같으면 다른 줄이 하나도 없다', () => {
    const same = [p({ slug: 'a' }), p({ slug: 'b' })];
    expect(differingRows(same)).toEqual([]);
  });

  it('값이 다르면 값 줄이 잡힌다', () => {
    const two = [p({ slug: 'a' }), p({ slug: 'b', price: 199_000 })];
    expect(differingRows(two)).toContain('price');
    expect(differingRows(two)).not.toContain('brand');
  });

  it('차례는 COMPARE_ROW 를 따른다 — 사람이 먼저 보는 것이 위다', () => {
    const two = [
      p({ slug: 'a' }),
      p({ slug: 'b', price: 1, brand: '다른곳', rating: 3, soldOut: true }),
    ];
    const rows = differingRows(two);
    expect(rows).toEqual(COMPARE_ROW.filter((r) => rows.includes(r)));
    expect(rows.indexOf('price')).toBeLessThan(rows.indexOf('brand'));
  });

  /** 리뷰가 없는 것과 0점은 다르다 */
  it('평점 없음과 평점 0 은 다른 값이다', () => {
    expect(rowDiffers('rating', [p({ slug: 'a', rating: undefined }), p({ slug: 'b', rating: 0 })]))
      .toBe(true);
  });

  it('옵션은 차례가 달라도 같은 것으로 본다', () => {
    const a = p({ slug: 'a', options: { 색상: ['오트밀', '차콜'] } });
    const b = p({ slug: 'b', options: { 색상: ['차콜', '오트밀'] } });
    expect(rowDiffers('options', [a, b])).toBe(false);
  });

  it('하나뿐이면 다를 것이 없다', () => {
    expect(differingRows([p({ slug: 'a' })])).toEqual([]);
  });
});

describe('그 줄에서 나은 것', () => {
  it('값은 쌀수록 낫다', () => {
    expect(bestInRow('price', [p({ slug: 'a' }), p({ slug: 'b', price: 199_000 })])).toEqual(['b']);
  });

  it('평점은 높을수록 낫다', () => {
    expect(bestInRow('rating', [p({ slug: 'a', rating: 4.5 }), p({ slug: 'b', rating: 3.9 })]))
      .toEqual(['a']);
  });

  it('같은 값이 여럿이면 여럿 다 표시한다 — 하나만 고르면 그 하나가 나아 보인다', () => {
    const rows = bestInRow('price', [
      p({ slug: 'a', price: 100 }), p({ slug: 'b', price: 100 }), p({ slug: 'c', price: 200 }),
    ]);
    expect(rows).toEqual(['a', 'b']);
  });

  it('전부 같으면 아무도 최고가 아니다 — 그건 최고가 아니라 무의미다', () => {
    expect(bestInRow('price', [p({ slug: 'a' }), p({ slug: 'b' })])).toEqual([]);
  });

  /**
   * 어느 브랜드가 나은지는 우리가 정할 일이 아니다. 재고와 배송도 마찬가지 —
   * 품절이 '나쁜' 것은 맞지만 그건 값처럼 정도를 매길 수 있는 것이 아니다.
   */
  it.each(['brand', 'options', 'stock', 'shipping'] as const)(
    '%s 은 낫고 못함을 정하지 않는다',
    (row) => {
      expect(bestInRow(row, [p({ slug: 'a' }), p({ slug: 'b', brand: '다른곳', soldOut: true, freeShipping: false, options: {} })]))
        .toEqual([]);
    },
  );

  it('평점이 없는 상품이 섞이면 아무도 고르지 않는다 — 없는 것과 낮은 것은 다르다', () => {
    expect(bestInRow('rating', [p({ slug: 'a', rating: 4.5 }), p({ slug: 'b', rating: undefined })]))
      .toEqual([]);
  });
});
