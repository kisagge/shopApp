import { describe, it, expect } from 'vitest';
import { MAX_FACET_VALUES } from '@shop/core';
import { catalogQuerySchema } from '../src/catalog';

/**
 * 주소에서 오는 값이라 사용자가 손으로 고칠 수 있다.
 * **거절하지 않고 되돌린다** — 링크를 잘못 받았다고 오류 화면을 띄우면
 * 아무것도 못 한다.
 */

describe('색상·사이즈 파라미터', () => {
  it('하나만 오면 배열로 맞춰 준다 — 화면마다 다루면 한 곳에서 빠뜨린다', () => {
    expect(catalogQuerySchema.parse({ color: '블랙' }).color).toEqual(['블랙']);
  });

  it('여러 개는 그대로 배열', () => {
    expect(catalogQuerySchema.parse({ size: ['M', 'L'] }).size).toEqual(['M', 'L']);
  });

  it('없으면 빈 배열 — 화면이 undefined 를 따로 다루지 않아도 된다', () => {
    expect(catalogQuerySchema.parse({}).color).toEqual([]);
  });

  it('같은 값이 두 번 붙어도 한 번으로 본다', () => {
    // 뒤로 가기를 오가면 주소에 흔히 생긴다
    expect(catalogQuerySchema.parse({ color: ['블랙', '블랙'] }).color).toEqual(['블랙']);
  });

  it('매대가 내놓는 만큼은 다 고를 수 있다', () => {
    /*
     * 여기가 무너져 있었다. 상한이 10 이던 시절, 검색 화면 한 곳에 사이즈
     * 칩이 열둘 떴는데 그걸 전부 누르면 계약이 고른 것을 통째로 버렸다.
     * 화면은 조건 없는 목록과 빈 체크박스로 돌아왔다 — 누른 사람에게는
     * 아무 일도 일어나지 않은 것으로 보인다.
     */
    const twelve = Array.from({ length: 12 }, (_, i) => `v${i}`);
    expect(catalogQuerySchema.parse({ size: twelve }).size).toHaveLength(12);
  });

  it('상한을 넘겨도 버리지 않고 자른다', () => {
    // 버리면 조건이 조용히 사라진다. 자르면 적어도 누른 대로 좁혀진다.
    const many = Array.from({ length: MAX_FACET_VALUES + 20 }, (_, i) => `v${i}`);
    expect(catalogQuerySchema.parse({ size: many }).size).toHaveLength(MAX_FACET_VALUES);
  });

  it('장난 수준으로 많이 붙이면 그때는 버린다', () => {
    // 주소에 값을 수백 개 매다는 것은 사람이 하는 일이 아니다.
    const absurd = Array.from({ length: 5_000 }, (_, i) => `v${i}`);
    expect(catalogQuerySchema.parse({ size: absurd }).size).toEqual([]);
  });

  it('이상한 값이 와도 화면이 죽지 않는다', () => {
    expect(catalogQuerySchema.parse({ color: 123 }).color).toEqual([]);
    expect(catalogQuerySchema.parse({ size: { a: 1 } }).size).toEqual([]);
  });

  it('빈 가격 칸은 안 정한 것이다 — 0 이 아니다', () => {
    /*
     * **여기가 무너져 있었다.** 폼의 가격 칸은 비어 있는 채로 함께 넘어간다.
     * `Number('')` 이 0 이라 `maxPrice=0` 이 되었고, 그러면 0원 이하인
     * 상품만 남아 **매대가 통째로 비었다.** 색 하나 고르고 적용을 누르는
     * 흔한 동선이 정확히 이 자리다.
     */
    const parsed = catalogQuerySchema.parse({ minPrice: '', maxPrice: '' });
    expect(parsed.minPrice).toBeUndefined();
    expect(parsed.maxPrice).toBeUndefined();
  });

  it('손으로 친 0 은 0 이다', () => {
    // 빈 칸과 다르다. 그건 사용자가 정한 값이다.
    expect(catalogQuerySchema.parse({ maxPrice: '0' }).maxPrice).toBe(0);
  });

  it('정렬·가격은 그대로 동작한다', () => {
    const parsed = catalogQuerySchema.parse({ sort: 'price_asc', minPrice: '10000' });
    expect(parsed.sort).toBe('price_asc');
    expect(parsed.minPrice).toBe(10_000);
  });
});
