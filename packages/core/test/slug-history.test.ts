import { describe, it, expect } from 'vitest';
import { slugLookup, isSlugTaken } from '../src/slug-history';

/**
 * 주소가 이름 변경에서 살아남는 규칙.
 *
 * 여기서 지키는 것은 두 가지다 — **어디로 보낼지**와 **누가 그 주소를 쓸 수
 * 있는지**. 둘 다 틀리면 조용하다: 잘못 보내면 엉뚱한 상품이 열리고,
 * 잘못 내주면 한 주소가 두 곳을 가리킨다.
 */

describe('주소 하나를 찾아본 결과', () => {
  it('지금 쓰는 주소면 그대로 연다', () => {
    expect(slugLookup({ current: { id: 'p1' }, movedTo: null })).toEqual({
      kind: 'current',
      value: { id: 'p1' },
    });
  });

  it('옛 주소면 새 주소를 알려 준다', () => {
    expect(slugLookup({ current: null, movedTo: 'new-slug' })).toEqual({
      kind: 'moved',
      to: 'new-slug',
    });
  });

  it('둘 다 없으면 없는 주소다', () => {
    expect(slugLookup({ current: null, movedTo: null })).toEqual({ kind: 'gone' });
  });

  /**
   * a → b → a 로 되돌린 경우. a 는 지금 주소이면서 기록에도 남아 있을 수
   * 있는데, 기록을 먼저 보면 **자기 자신으로 넘기는 고리**가 된다.
   */
  it('되돌린 주소는 넘기지 않고 그냥 연다', () => {
    const found = slugLookup({ current: { id: 'p1' }, movedTo: 'a' });
    expect(found).toEqual({ kind: 'current', value: { id: 'p1' } });
  });
});

describe('이 주소를 쓸 수 있는가', () => {
  it('아무도 안 쓰면 쓸 수 있다', () => {
    expect(isSlugTaken({ liveOwnerId: null, historyOwnerId: null })).toBe(false);
  });

  it('남이 지금 쓰고 있으면 못 쓴다', () => {
    expect(isSlugTaken({ liveOwnerId: 'other', historyOwnerId: null })).toBe(true);
  });

  /**
   * **여기가 이 규칙의 핵심이다.** 남이 버리고 간 주소를 집어 가면, 그
   * 주소가 한쪽에서는 새 주인을 가리키고 다른 쪽에서는 옛 주인으로 넘긴다.
   */
  it('남이 버리고 간 주소도 못 쓴다', () => {
    expect(isSlugTaken({ liveOwnerId: null, historyOwnerId: 'other' })).toBe(true);
  });

  it('자기가 버린 주소는 다시 쓸 수 있다 — 되돌리는 것은 흔한 일이다', () => {
    expect(isSlugTaken({ liveOwnerId: null, historyOwnerId: 'me', selfId: 'me' })).toBe(false);
  });

  it('자기가 지금 쓰는 주소를 그대로 두는 것도 막지 않는다', () => {
    expect(isSlugTaken({ liveOwnerId: 'me', historyOwnerId: null, selfId: 'me' })).toBe(false);
  });

  it('새로 만드는 중이면 자기 것이 있을 수 없다', () => {
    expect(isSlugTaken({ liveOwnerId: null, historyOwnerId: 'someone' })).toBe(true);
  });
});
