import { describe, it, expect } from 'vitest';
import { isCollectionSlug, hasVisibleItems, MAX_COLLECTION_ITEMS } from '../src/collection';

describe('기획전 주소', () => {
  it.each(['winter-outer', 'knit', 'ss26-pick-2'])('받는다: %s', (slug) => {
    expect(isCollectionSlug(slug)).toBe(true);
  });

  it.each([
    ['w', '한 글자는 주소로 쓸 수 없다'],
    ['Winter', '대문자를 받으면 같은 기획전이 여러 주소로 열린다'],
    ['winter outer', '공백은 인코딩돼 알아볼 수 없게 된다'],
    ['겨울', '한글 주소는 공유될 때 깨져 보인다'],
    ['-winter', '하이픈으로 시작할 수 없다'],
    ['winter-', '하이픈으로 끝날 수 없다'],
    ['winter--outer', '하이픈이 겹칠 수 없다'],
    ['../etc', '경로를 벗어나려는 값은 받지 않는다'],
  ])('거절한다: %s (%s)', (slug) => {
    expect(isCollectionSlug(slug)).toBe(false);
  });

  it('너무 긴 주소는 받지 않는다', () => {
    expect(isCollectionSlug('a'.repeat(61))).toBe(false);
    expect(isCollectionSlug('a'.repeat(60))).toBe(true);
  });
});

describe('보여 줄 만한가', () => {
  it('빈 기획전은 노출하지 않는다 — 눌렀더니 빈 화면이 가장 나쁘다', () => {
    expect(hasVisibleItems(0)).toBe(false);
  });

  it('하나라도 있으면 보여 준다', () => {
    expect(hasVisibleItems(1)).toBe(true);
  });

  it('담을 수 있는 수에 상한이 있다', () => {
    expect(MAX_COLLECTION_ITEMS).toBeGreaterThan(0);
  });
});
