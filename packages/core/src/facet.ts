/**
 * 목록에서 좁혀 볼 수 있는 축. 순수 로직만.
 *
 * 지금까지 필터는 가격뿐이었다. 색상과 사이즈는 **데이터에 이미 다 있었는데**
 * 화면에서 고를 길이 없었다 — 옵션 그룹과 값이 상품마다 붙어 있고, 변형이
 * 그 조합을 가리킨다.
 */

/**
 * 주소에 쓰는 이름 → DB 의 옵션 그룹 이름.
 *
 * **주소에는 영문을 쓴다.** 한글 파라미터 이름은 인코딩돼 링크를 공유할 때
 * 알아볼 수 없게 된다. 값(블랙·M)은 우리가 만든 목록에서만 오므로 한글이어도
 * 되지만, 열쇠까지 한글로 두면 주소가 통째로 읽히지 않는다.
 */
export const FACET_GROUP = {
  color: '색상',
  size: '사이즈',
} as const;

export type FacetKey = keyof typeof FACET_GROUP;

export const FACET_KEYS = Object.keys(FACET_GROUP) as readonly FacetKey[];

/**
 * 한 축에서 고를 수 있는 값의 수.
 *
 * 주소로 들어오는 값이라 상한이 필요하다. 없으면 `?size=` 를 수백 개 붙여
 * IN 절을 부풀릴 수 있다.
 */
export const MAX_FACET_VALUES = 10;

/**
 * 들어온 값을 다듬는다.
 *
 * 같은 값이 두 번 오면 한 번으로 본다 — 주소에 `?color=블랙&color=블랙` 이
 * 붙는 것은 화면을 되돌아갈 때 흔히 생기는 일이고, 그대로 넘기면 IN 절만
 * 길어진다.
 */
export function normalizeFacetValues(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const value of raw) {
    const trimmed = value.trim();
    if (trimmed.length === 0) continue;
    seen.add(trimmed);
    if (seen.size === MAX_FACET_VALUES) break;
  }
  return [...seen];
}

export interface FacetValue {
  readonly value: string;
  /** 색상에만 있다. 스와치를 그리는 데 쓴다. */
  readonly swatchHex: string | null;
}

/**
 * 지금 화면에서 고를 수 있는 값들.
 *
 * **전체 목록을 그대로 두지 않는다.** 니트 화면에 "34" 같은 청바지 사이즈를
 * 띄우면 누른 사람은 빈 화면을 만난다 — 눌렀더니 아무것도 없는 것이 이
 * 기능에서 가장 나쁜 상태다. 지금 범위 안에 실제로 있는 값만 준다.
 */
export type Facets = Readonly<Record<FacetKey, readonly FacetValue[]>>;

export const EMPTY_FACETS: Facets = { color: [], size: [] };

/** 축 하나라도 고를 것이 있는가. 없으면 필터 자리를 그리지 않는다. */
export function hasFacets(facets: Facets): boolean {
  return FACET_KEYS.some((key) => facets[key].length > 0);
}
