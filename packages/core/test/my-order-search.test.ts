import { describe, it, expect } from 'vitest';
import { readMyOrderSearch, readOrderSearch } from '../src/order-search';

/**
 * 손님이 자기 주문을 찾을 때.
 *
 * **운영자와 손님은 다른 것을 쥐고 온다.** 운영자는 문의를 받았으니 주문번호
 * 아니면 사는 사람의 이름이다. 손님은 자기 주문만 보므로 이름으로 찾을 일이
 * 없고, 대신 "작년에 산 그 코트" 를 찾는다.
 */

describe('내 주문 검색어', () => {
  it('완전한 주문번호는 번호로 읽는다', () => {
    // 유니크 인덱스를 쓰는 갈래다. 부분 일치로 던지면 전체를 훑는다.
    expect(readMyOrderSearch('20260831-8842713')).toEqual({
      kind: 'orderNo',
      value: '20260831-8842713',
    });
  });

  it('뒷자리만 적어도 번호로 본다', () => {
    expect(readMyOrderSearch('8842713').kind).toBe('orderNoPartial');
  });

  it('나머지는 상품명이다 — 손님은 자기 이름으로 찾지 않는다', () => {
    expect(readMyOrderSearch('울 코트')).toEqual({ kind: 'product', value: '울 코트' });
  });

  it('빈 값은 검색이 아니다', () => {
    // 공백만 친 것을 검색으로 보면 아무것도 없는 목록이 나온다
    for (const empty of [undefined, '', '   ']) {
      expect(readMyOrderSearch(empty).kind, String(empty)).toBe('none');
    }
  });

  it('번호를 가리는 규칙은 운영자 쪽과 같은 것을 쓴다', () => {
    /*
     * **둘로 나눠 적으면 주문번호 모양이 바뀔 때 한쪽만 고쳐진다.** 그때
     * 손님은 번호를 통째로 붙여넣었는데 상품명으로 검색돼 빈손이 된다.
     */
    for (const value of ['20260831-8842713', '8842713', '2026']) {
      expect(readMyOrderSearch(value).kind, value).toBe(readOrderSearch(value).kind);
    }
  });
});
