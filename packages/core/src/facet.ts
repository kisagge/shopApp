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
 * 옷 사이즈의 정해진 차례.
 *
 * 알파벳순으로 두면 L · M · S · XL 이 되어 뜻이 없다. 사람이 아는 차례가
 * 따로 있으므로 여기 적어 둔다.
 */
const LETTER_SIZES = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL'];

/**
 * 매대 전체에서 값이 놓일 자리.
 *
 * **상품마다 매긴 순번은 여기서 쓸 수 없다.** 그 값은 "이 상품의 옵션 중
 * 몇 번째" 라는 뜻이라, 사이즈가 ['M','L'] 인 상품은 M 에 0 을 준다. 여러
 * 상품을 접으면 그 0 들이 뒤섞여 `250 FREE M S 260 L 270 XL` 같은 목록이
 * 나온다 — 실제로 브랜드 화면이 그랬다.
 *
 * 상품이 여덟일 때는 사이즈가 몇 개 없어 티가 안 났다. 매대가 자라면서
 * 드러난 종류다.
 */
function sizeRank(value: string): [number, number, string] {
  const letter = LETTER_SIZES.indexOf(value.toUpperCase());
  if (letter !== -1) return [0, letter, value];

  // 신발 250 · 허리 28 · 벨트 90 — 숫자는 숫자끼리 오름차순
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return [1, numeric, value];

  // FREE 처럼 크기가 아닌 것은 맨 뒤로. 사이에 끼면 흐름이 끊긴다.
  return [2, 0, value];
}

/**
 * 고를 수 있는 값을 사람이 읽는 차례로 놓는다.
 *
 * 색은 정해진 차례가 없어 가나다순으로 둔다 — 아무 순서보다 **예측할 수
 * 있는 순서**가 낫다. 같은 화면을 두 번 열었을 때 자리가 바뀌지 않는다.
 */
export function sortFacetValues(key: FacetKey, values: readonly FacetValue[]): FacetValue[] {
  const sorted = [...values];
  if (key === 'size') {
    sorted.sort((a, b) => {
      const [ga, na, va] = sizeRank(a.value);
      const [gb, nb, vb] = sizeRank(b.value);
      return ga - gb || na - nb || va.localeCompare(vb, 'ko');
    });
    return sorted;
  }
  sorted.sort((a, b) => a.value.localeCompare(b.value, 'ko'));
  return sorted;
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
