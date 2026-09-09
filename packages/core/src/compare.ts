/**
 * 상품 비교.
 *
 * 나란히 놓는 것만으로는 비교가 되지 않는다. **네 장의 사양서를 붙여 놓으면
 * 사람이 눈으로 diff 를 떠야 한다** — 그건 화면이 할 일이다. 그래서 이 파일이
 * 하는 일은 둘이다: 무엇을 어떤 차례로 보여 줄지 정하고, **어느 줄이 실제로
 * 다른지** 가려낸다.
 */

/** 한 번에 견줄 수 있는 개수 */
export const MAX_COMPARE = 4;

/**
 * 최소 두 개.
 *
 * 하나짜리 비교표는 상품 상세를 못생기게 다시 그린 것에 지나지 않는다.
 */
export const MIN_COMPARE = 2;

/**
 * 비교표의 줄.
 *
 * **차례가 곧 판단의 차례다.** 사람이 먼저 보는 것을 위에 둔다 — 값, 그다음
 * 그 값이 싼 값인지(할인), 그다음 남들이 어떻게 봤는지(평점), 그다음 살 수
 * 있는지(재고). 브랜드와 옵션은 그 뒤다.
 */
export const COMPARE_ROW = [
  'price',
  'discount',
  'rating',
  'reviewCount',
  'stock',
  'brand',
  'shipping',
  'options',
] as const;

export type CompareRow = (typeof COMPARE_ROW)[number];

/** 견줄 상품 하나. 화면이 아니라 비교가 필요로 하는 것만 담는다. */
export interface ComparableProduct {
  readonly slug: string;
  readonly categorySlug: string;
  readonly brand: string;
  /** 실제로 파는 값 */
  readonly price: number;
  /** 취소선 정가. 할인이 없으면 undefined */
  readonly listPrice: number | undefined;
  readonly discountPercent: number | undefined;
  /** 평점. 리뷰가 없으면 undefined — 0 과 다르다 */
  readonly rating: number | undefined;
  readonly reviewCount: number;
  readonly soldOut: boolean;
  readonly freeShipping: boolean;
  /** "색상" → ["오트밀", "차콜"] */
  readonly options: Readonly<Record<string, readonly string[]>>;
}

export const COMPARE_ERROR = {
  TOO_FEW: 'compare.tooFew',
  TOO_MANY: 'compare.tooMany',
  MIXED_CATEGORY: 'compare.mixedCategory',
} as const;

export type CompareError = (typeof COMPARE_ERROR)[keyof typeof COMPARE_ERROR];

/**
 * 견줄 수 있는 묶음인가.
 *
 * **갈래가 다르면 견주지 않는다.** 코트와 니트를 나란히 놓으면 값과 평점이
 * 나오기는 하는데 그 숫자로 정할 수 있는 것이 없다 — 애초에 둘 중 하나를
 * 고르려던 것이 아니기 때문이다. 갈래를 지키면 비교표의 모든 줄이 같은
 * 뜻을 갖는다.
 */
export function compareError(products: readonly ComparableProduct[]): CompareError | null {
  if (products.length < MIN_COMPARE) return COMPARE_ERROR.TOO_FEW;
  if (products.length > MAX_COMPARE) return COMPARE_ERROR.TOO_MANY;

  const first = products[0]!.categorySlug;
  if (products.some((p) => p.categorySlug !== first)) return COMPARE_ERROR.MIXED_CATEGORY;

  return null;
}

/** 담을 수 있는가. 화면이 담기 전에 묻는다. */
export function canAddToCompare(
  current: readonly { readonly slug: string; readonly categorySlug: string }[],
  next: { readonly slug: string; readonly categorySlug: string },
): boolean {
  if (current.some((p) => p.slug === next.slug)) return true; // 이미 담긴 것은 빼는 동작이다
  if (current.length >= MAX_COMPARE) return false;
  return current.length === 0 || current[0]!.categorySlug === next.categorySlug;
}

/** 한 줄에서 상품 하나가 갖는 값. 비교는 이 값들끼리 한다. */
function valueOf(row: CompareRow, product: ComparableProduct): string {
  switch (row) {
    case 'price':
      return String(product.price);
    case 'discount':
      return String(product.discountPercent ?? 0);
    case 'rating':
      return product.rating === undefined ? '' : product.rating.toFixed(1);
    case 'reviewCount':
      return String(product.reviewCount);
    case 'stock':
      return product.soldOut ? 'out' : 'in';
    case 'brand':
      return product.brand;
    case 'shipping':
      return product.freeShipping ? 'free' : 'paid';
    case 'options':
      return Object.entries(product.options)
        .map(([name, values]) => `${name}:${[...values].sort().join(',')}`)
        .sort()
        .join('|');
  }
}

/**
 * 이 줄에서 상품들이 서로 다른가.
 *
 * **같은 줄은 비교에 아무것도 보태지 않는다.** 네 상품이 모두 무료배송이면
 * 그 줄은 "무료배송 · 무료배송 · 무료배송 · 무료배송" 이고, 읽는 사람은 네
 * 번 읽고 나서야 아무 정보도 없었다는 것을 안다. 화면은 이 값을 써서 다른
 * 줄을 앞세우거나 같은 줄을 접는다 — **지우지는 않는다.** 같다는 사실도
 * 알아야 하는 사람이 있고, 접힌 것은 펼 수 있지만 없는 것은 펼 수 없다.
 */
export function rowDiffers(row: CompareRow, products: readonly ComparableProduct[]): boolean {
  if (products.length < 2) return false;
  const first = valueOf(row, products[0]!);
  return products.some((p) => valueOf(row, p) !== first);
}

/** 다른 줄들. 차례는 COMPARE_ROW 를 따른다. */
export function differingRows(products: readonly ComparableProduct[]): readonly CompareRow[] {
  return COMPARE_ROW.filter((row) => rowDiffers(row, products));
}

/**
 * 이 줄에서 가장 나은 상품들의 slug.
 *
 * **"가장 나은" 이 뜻을 갖는 줄에서만 답한다.** 값은 쌀수록, 평점은 높을수록
 * 낫다고 말할 수 있지만 브랜드와 옵션은 그렇지 않다 — 어느 브랜드가 나은지는
 * 우리가 정할 일이 아니다. 그런 줄은 빈 배열을 돌려준다.
 *
 * 같은 값이 여럿이면 **여럿 다 표시한다.** 하나만 고르면 그 하나가 무언가
 * 더 나은 것처럼 보인다.
 */
export function bestInRow(
  row: CompareRow,
  products: readonly ComparableProduct[],
): readonly string[] {
  const score = (p: ComparableProduct): number | null => {
    switch (row) {
      case 'price':
        return -p.price;
      case 'discount':
        return p.discountPercent ?? 0;
      case 'rating':
        return p.rating ?? null;
      case 'reviewCount':
        return p.reviewCount;
      default:
        // 재고·브랜드·배송·옵션은 낫고 못함을 우리가 정하지 않는다
        return null;
    }
  };

  const scored = products.map((p) => ({ slug: p.slug, value: score(p) }));
  if (scored.some((s) => s.value === null)) return [];

  const best = Math.max(...scored.map((s) => s.value!));
  // 전부 같으면 전부 최고다 — 그건 최고가 아니라 무의미다
  if (scored.every((s) => s.value === best)) return [];

  return scored.filter((s) => s.value === best).map((s) => s.slug);
}
