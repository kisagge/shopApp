import { describe, it, expect } from 'vitest';
import {
  canManageCategory, canDeleteCategory, categoryPlacementProblem, isCategorySlug,
} from '../src/category';
import type { Actor } from '../src/authz';

/**
 * 카테고리 관리 정책.
 *
 * **바꿀 창구가 없었다.** 매대의 카테고리 조회에 "창구가 없어서 거의 바뀌지
 * 않는다" 고 적혀 있다 — 캐시를 길게 잡아도 되는 이유로 적은 말이지만, 관리
 * 화면이 없다는 사실을 돌려 말한 것이기도 하다.
 */

const admin: Actor = { id: 'u-a', role: 'ADMIN', merchantId: null };
const superAdmin: Actor = { id: 'u-s', role: 'SUPER_ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };
const customer: Actor = { id: 'u-c', role: 'CUSTOMER', merchantId: null };

const top = (over: Record<string, unknown> = {}) =>
  ({ id: 'c-top', parentId: null, productCount: 0, ...over });

describe('누가 다루는가', () => {
  it('운영진만 다룬다', () => {
    expect(canManageCategory(admin)).toBe(true);
    expect(canManageCategory(superAdmin)).toBe(true);
  });

  it('가맹점에게는 열지 않는다 — 카테고리는 누구의 것도 아니다', () => {
    /*
     * 한 가맹점이 매대의 메뉴를 바꾸면 남의 상품이 걸린 자리가 함께 움직인다.
     * 브랜드는 그 가맹점의 간판이라 다르다.
     */
    expect(canManageCategory(merchant)).toBe(false);
  });

  it('고객은 당연히 못 다룬다', () => {
    expect(canManageCategory(customer)).toBe(false);
  });
});

describe('둘 수 있는 자리', () => {
  it('최상위는 언제나 둘 수 있다', () => {
    expect(categoryPlacementProblem({ parent: null })).toBeNull();
  });

  it('최상위 밑에는 둘 수 있다', () => {
    expect(categoryPlacementProblem({ parent: top() })).toBeNull();
  });

  it('손자는 못 만든다 — 매대가 그 아래를 그리지 않는다', () => {
    /*
     * 머리 메뉴는 최상위와 자식 한 겹만 그린다. 손자를 만들면 어디에도 안 보이는
     * 갈래가 생기고, 거기 상품을 붙이면 아무도 못 찾는다.
     */
    expect(categoryPlacementProblem({ parent: top({ parentId: 'c-root' }) }))
      .toEqual({ kind: 'TOO_DEEP' });
  });

  it('상품이 붙은 갈래 밑에는 못 만든다', () => {
    /*
     * 상품은 말단에만 붙는다. 밑에 자식을 넣으면 그 상품들이 말단 아닌 자리에
     * 남아, 폼에서는 고를 수 없는데 필터는 상위로 다뤄 어느 쪽으로도 빠진다.
     * 시드의 슈즈·액세서리가 정확히 그런 모양이다(최상위인데 상품을 가진다).
     */
    expect(categoryPlacementProblem({ parent: top({ productCount: 4 }) }))
      .toEqual({ kind: 'PARENT_HAS_PRODUCTS' });
  });

  it('자기 자신 밑으로는 못 옮긴다', () => {
    expect(categoryPlacementProblem({
      parent: top({ id: 'c-1' }),
      moving: { id: 'c-1', descendantIds: [] },
    })).toEqual({ kind: 'CYCLE' });
  });

  it('자기 자손 밑으로도 못 옮긴다 — 나무에서 잘려 나간다', () => {
    expect(categoryPlacementProblem({
      parent: top({ id: 'c-child' }),
      moving: { id: 'c-1', descendantIds: ['c-child'] },
    })).toEqual({ kind: 'CYCLE' });
  });

  it('깊이를 먼저 본다 — 두 가지가 겹쳐도 한 가지만 말한다', () => {
    // 고칠 방법이 다르다. 여러 이유를 한꺼번에 던지면 무엇부터 할지 알 수 없다.
    expect(categoryPlacementProblem({ parent: top({ parentId: 'c-root', productCount: 9 }) }))
      .toEqual({ kind: 'TOO_DEEP' });
  });
});

describe('지울 수 있는가', () => {
  it('비어 있으면 지운다 — 잘못 만든 것을 되돌리는 용도다', () => {
    expect(canDeleteCategory({ productCount: 0, childCount: 0 })).toBe(true);
  });

  it('상품이 있으면 못 지운다 — 그 상품들이 갈 곳을 잃는다', () => {
    expect(canDeleteCategory({ productCount: 1, childCount: 0 })).toBe(false);
  });

  it('자식이 있으면 못 지운다 — 그 갈래가 통째로 사라진다', () => {
    expect(canDeleteCategory({ productCount: 0, childCount: 1 })).toBe(false);
  });
});

describe('주소 규칙', () => {
  it('브랜드·기획전과 같은 규칙이다', () => {
    expect(isCategorySlug('outer')).toBe(true);
    expect(isCategorySlug('outer-coat')).toBe(true);
    expect(isCategorySlug('아우터')).toBe(false);
    expect(isCategorySlug('Outer')).toBe(false);
    expect(isCategorySlug('-outer')).toBe(false);
    expect(isCategorySlug('o')).toBe(false);
  });
});
