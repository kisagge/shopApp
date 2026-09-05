import { describe, it, expect } from 'vitest';
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

  it('개수가 넘치면 통째로 버린다 — 목록을 망가뜨리지 않는다', () => {
    const many = Array.from({ length: 30 }, (_, i) => `v${i}`);
    expect(catalogQuerySchema.parse({ size: many }).size).toEqual([]);
  });

  it('이상한 값이 와도 화면이 죽지 않는다', () => {
    expect(catalogQuerySchema.parse({ color: 123 }).color).toEqual([]);
    expect(catalogQuerySchema.parse({ size: { a: 1 } }).size).toEqual([]);
  });

  it('정렬·가격은 그대로 동작한다', () => {
    const parsed = catalogQuerySchema.parse({ sort: 'price_asc', minPrice: '10000' });
    expect(parsed.sort).toBe('price_asc');
    expect(parsed.minPrice).toBe(10_000);
  });
});
