/**
 * 상품 복제 — 사본의 이름·주소·SKU 를 짓는다. 순수 로직만.
 *
 * 색만 다른 상품, 시즌만 바뀐 상품을 처음부터 다시 적으면 옵션·설명·가격을 옮겨 적다 틀린다. 복제는 **틀을 그대로
 * 가져오되 팔리는 값은 가져오지 않는다** — 사본은 임시저장이고 재고는 0 이다. 게시 전에 사람이 한 번 보고 고치게.
 *
 * 이름·주소·SKU 는 겹치면 안 되고(주소·SKU 는 유일해야 한다) 원본과 **구분돼야** 한다. 원본과 같은 이름으로 목록에
 * 두 줄이 서면 어느 것을 고치는지 모른다.
 */

export const PRODUCT_NAME_MAX = 120;
export const PRODUCT_SLUG_MAX = 80;
export const VARIANT_SKU_MAX = 64;

const COPY_NAME_SUFFIX = ' (사본)';

/** "울 코트" → "울 코트 (사본)". 이미 사본이면 한 번 더 붙이지 않는다 — "(사본) (사본)" 은 아무것도 말하지 않는다 */
export function copyNameOf(name: string, max = PRODUCT_NAME_MAX): string {
  if (name.endsWith(COPY_NAME_SUFFIX)) return name;
  return `${name.slice(0, max - COPY_NAME_SUFFIX.length).trimEnd()}${COPY_NAME_SUFFIX}`;
}

/**
 * 사본 주소 후보 — n 번째(1부터). "wool-coat" → "wool-coat-copy", "wool-coat-copy-2", …
 *
 * 길이를 넘으면 **원본 쪽을 자른다** — 꼬리("-copy-2")를 자르면 후보끼리 겹친다. 자른 끝의 하이픈은 지운다(주소 형식).
 */
export function copySlugCandidate(slug: string, n: number, max = PRODUCT_SLUG_MAX): string {
  const base = slug.replace(/-copy(?:-\d+)?$/, '');
  const tail = n === 1 ? '-copy' : `-copy-${n}`;
  return `${base.slice(0, max - tail.length).replace(/-+$/, '')}${tail}`;
}

/** 사본 SKU 후보 — "COAT-OAT-M" → "COAT-OAT-M-C", "COAT-OAT-M-C2", … 창고에서 원본과 한눈에 갈린다 */
export function copySkuCandidate(sku: string, n: number, max = VARIANT_SKU_MAX): string {
  const tail = n === 1 ? '-C' : `-C${n}`;
  return `${sku.slice(0, max - tail.length).replace(/-+$/, '')}${tail}`;
}
