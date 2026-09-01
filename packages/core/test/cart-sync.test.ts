import { describe, it, expect } from 'vitest';
import { mergeCartLines, sameCart, MAX_CART_LINES, MAX_QUANTITY } from '../src/cart-sync';

const line = (variantId: string, quantity = 1, selected = true) => ({ variantId, quantity, selected });

describe('병합 — 수량', () => {
  it('한쪽에만 있으면 그대로 가져온다', () => {
    expect(mergeCartLines([line('a', 2)], [line('b', 3)]))
      .toEqual([line('b', 3), line('a', 2)]);
  });

  it('양쪽에 있으면 큰 쪽을 쓴다 — 더하지 않는다', () => {
    // 폰에서 2개, 노트북에서 1개 담았다면 원하는 건 3개가 아니라 2개다.
    // 더하면 로그인할 때마다 수량이 불어난다.
    expect(mergeCartLines([line('a', 1)], [line('a', 2)])).toEqual([line('a', 2)]);
    expect(mergeCartLines([line('a', 5)], [line('a', 2)])).toEqual([line('a', 5)]);
  });

  it('여러 번 병합해도 수량이 늘지 않는다', () => {
    let cart = [line('a', 2)];
    for (let i = 0; i < 5; i += 1) cart = mergeCartLines([line('a', 2)], cart);
    expect(cart).toEqual([line('a', 2)]);
  });

  it('상한을 넘지 않는다', () => {
    expect(mergeCartLines([line('a', 999)], [])[0]?.quantity).toBe(MAX_QUANTITY);
  });

  it('0이나 음수는 1로 올린다', () => {
    expect(mergeCartLines([line('a', 0)], [])[0]?.quantity).toBe(1);
    expect(mergeCartLines([line('a', -3)], [])[0]?.quantity).toBe(1);
  });

  it('소수는 버린다', () => {
    expect(mergeCartLines([line('a', 2.9)], [])[0]?.quantity).toBe(2);
  });
});

describe('병합 — 선택 상태', () => {
  it('로컬을 따른다 — 방금 한 행동이 더 최근의 의사다', () => {
    expect(mergeCartLines([line('a', 1, false)], [line('a', 1, true)])[0]?.selected).toBe(false);
    expect(mergeCartLines([line('a', 1, true)], [line('a', 1, false)])[0]?.selected).toBe(true);
  });

  it('로컬에 없으면 서버 것을 그대로 둔다', () => {
    expect(mergeCartLines([], [line('a', 1, false)])[0]?.selected).toBe(false);
  });
});

describe('병합 — 줄 수 상한', () => {
  it('넘치면 서버에 있던 것부터 남긴다', () => {
    // 로컬은 방금 담은 것이라 다시 담기 쉽지만,
    // 서버 것은 다른 기기에서 담아 둔 것이라 되찾기 어렵다.
    const server = Array.from({ length: MAX_CART_LINES }, (_, i) => line(`s${i}`));
    const local = [line('local-1'), line('local-2')];
    const merged = mergeCartLines(local, server);
    expect(merged).toHaveLength(MAX_CART_LINES);
    expect(merged.every((l) => l.variantId.startsWith('s'))).toBe(true);
  });

  it('상한 안이면 둘 다 살린다', () => {
    expect(mergeCartLines([line('a')], [line('b')])).toHaveLength(2);
  });
});

describe('빈 장바구니', () => {
  it('둘 다 비면 빈 결과', () => {
    expect(mergeCartLines([], [])).toEqual([]);
  });

  it('로컬만 비면 서버 것이 그대로 남는다', () => {
    // 로그인만 했는데 다른 기기의 장바구니가 비워지면 안 된다
    expect(mergeCartLines([], [line('a', 3)])).toEqual([line('a', 3)]);
  });
});

describe('같은 장바구니 판정', () => {
  it('순서가 달라도 같으면 같다', () => {
    expect(sameCart([line('a'), line('b')], [line('b'), line('a')])).toBe(true);
  });

  it('수량이 다르면 다르다', () => {
    expect(sameCart([line('a', 1)], [line('a', 2)])).toBe(false);
  });

  it('선택 상태가 다르면 다르다', () => {
    expect(sameCart([line('a', 1, true)], [line('a', 1, false)])).toBe(false);
  });

  it('개수가 다르면 다르다', () => {
    expect(sameCart([line('a')], [line('a'), line('b')])).toBe(false);
  });
});
