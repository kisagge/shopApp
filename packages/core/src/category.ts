import { hasPermission, type Actor } from './authz';

/**
 * 카테고리 관리 정책.
 *
 * **바꿀 창구가 없었다.** 매대의 카테고리 조회에 "창구가 없어서 거의 바뀌지 않는다"
 * 고 적혀 있다 — 캐시를 길게 잡아도 되는 이유로 적은 말이지만, 그건 관리 화면이
 * 없다는 사실을 돌려 말한 것이기도 하다. 시즌마다 갈래를 더하려면 DB 콘솔을 열어야
 * 했고, 메뉴 순서(sortOrder)도 시드만 썼다.
 */

/** 주소 규칙. 브랜드·기획전과 같다 */
export const CATEGORY_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const CATEGORY_SLUG_MIN = 2;
export const CATEGORY_SLUG_MAX = 60;
export const CATEGORY_NAME_MAX = 30;

export const isCategorySlug = (value: string): boolean =>
  value.length >= CATEGORY_SLUG_MIN
  && value.length <= CATEGORY_SLUG_MAX
  && CATEGORY_SLUG_PATTERN.test(value);

/**
 * 카테고리는 **매대 전체의 갈래**다.
 *
 * 가맹점에게 열지 않는다 — 한 가맹점이 매대의 메뉴를 바꾸면 남의 상품이 걸린 자리가
 * 함께 움직인다. 브랜드는 그 가맹점의 간판이라 자기 것을 고칠 수 있지만, 카테고리는
 * 누구의 것도 아니다.
 */
export const canManageCategory = (actor: Actor): boolean =>
  hasPermission(actor, 'product:write') && actor.role !== 'MERCHANT';

export type CategoryProblem =
  /** 손자를 만들려 한다 */
  | { readonly kind: 'TOO_DEEP' }
  /** 상품이 붙은 갈래를 상위로 만들려 한다 */
  | { readonly kind: 'PARENT_HAS_PRODUCTS' }
  /** 자기 자신이나 자기 자손을 부모로 삼으려 한다 */
  | { readonly kind: 'CYCLE' };

/**
 * 이 부모 밑에 둘 수 있는가.
 *
 * **상품은 말단에만 붙는다.** 상품 폼이 `children: { none: {} }` 으로 말단만 고르게
 * 하는데, 이미 상품이 붙은 갈래 밑에 자식을 넣으면 그 상품들이 말단 아닌 자리에
 * 남는다 — 폼에서는 더 이상 고를 수 없는데 목록 필터는 그 갈래를 상위로 다뤄서,
 * **어느 쪽으로 세어도 빠지는 상품**이 된다. 시드의 슈즈·액세서리가 정확히 그런
 * 모양이다: 최상위인데 자식이 없고 상품을 가진다.
 */
export function categoryPlacementProblem(input: {
  /** 부모가 될 갈래. 최상위로 둘 것이면 null */
  readonly parent: { readonly id: string; readonly parentId: string | null; readonly productCount: number } | null;
  /** 옮기려는 갈래. 새로 만드는 중이면 없다 */
  readonly moving?: { readonly id: string; readonly descendantIds: readonly string[] } | undefined;
}): CategoryProblem | null {
  const { parent, moving } = input;
  if (parent === null) return null;

  /*
   * **두 단까지다.** 머리 메뉴는 최상위를, 그 아래로 자식 한 겹을 그린다
   * (queries/catalog/products). 손자를 만들면 어디에도 안 보이는 갈래가 생긴다 —
   * 상품을 붙여 놓고 아무도 못 찾는 자리다. 스키마 주석은 "2~3단" 이라 적혀 있지만
   * 실제로 그리는 것은 두 단이고 시드도 두 단이다.
   *
   * 깊이를 숫자 상수로 두지 않는다. 이 판단은 "부모에게 이미 부모가 있는가" 한 줄로
   * 끝나서, 2 라는 값을 따로 내보내 봐야 아무도 쓰지 않는다.
   */
  if (parent.parentId !== null) return { kind: 'TOO_DEEP' };
  if (parent.productCount > 0) return { kind: 'PARENT_HAS_PRODUCTS' };

  if (moving && (parent.id === moving.id || moving.descendantIds.includes(parent.id))) {
    return { kind: 'CYCLE' };
  }
  return null;
}

/**
 * 지울 수 있는가.
 *
 * **비어 있을 때만.** 상품이 붙어 있으면 그 상품들이 갈 곳을 잃고, 자식이 있으면
 * 그 갈래가 통째로 매대에서 사라진다. 잘못 만든 것을 되돌리는 용도로만 연다 —
 * 쓰던 갈래를 없애는 것은 상품을 먼저 옮기고 할 일이다.
 */
export const canDeleteCategory = (input: {
  readonly productCount: number;
  readonly childCount: number;
}): boolean => input.productCount === 0 && input.childCount === 0;
