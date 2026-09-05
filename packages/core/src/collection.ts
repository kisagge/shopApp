/**
 * 기획전 규칙. 순수 로직만.
 *
 * 기획전은 **사람이 고른 묶음**이다. 조건식으로 자동으로 채울 수도 있지만
 * 그건 이미 카테고리가 하는 일이고, "겨울을 오래 입는 법" 같은 묶음은 조건으로
 * 쓸 수 없다. 조건으로 만들 수 있는 것이었으면 기획전이라 부를 이유가 없다.
 */

/**
 * 한 기획전에 담을 수 있는 상품 수.
 *
 * 스무 개를 넘기면 사람이 고른 묶음이라기보다 목록이 되고, 목록이 필요하면
 * 카테고리가 이미 있다. 그래도 넉넉히 잡는다 — 시즌 기획전은 실제로 길다.
 */
export const MAX_COLLECTION_ITEMS = 40;

/** 주소에 그대로 들어가는 값이라 좁게 받는다. */
export const COLLECTION_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isCollectionSlug(value: string): boolean {
  return value.length >= 2 && value.length <= 60 && COLLECTION_SLUG_PATTERN.test(value);
}

/**
 * 보여 줄 만한가.
 *
 * **담긴 상품이 없으면 노출하지 않는다.** 기획전은 링크로 데려가는 자리인데,
 * 눌렀더니 빈 화면인 것이 이 기능에서 가장 나쁜 상태다. 상품이 내려가
 * 저절로 비는 일도 있으므로 만들 때만 보고 끝낼 수 없다.
 */
export function hasVisibleItems(itemCount: number): boolean {
  return itemCount > 0;
}
