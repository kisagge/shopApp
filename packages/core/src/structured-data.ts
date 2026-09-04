/**
 * 검색엔진이 읽는 구조화 데이터(JSON-LD). 순수 매핑만, I/O 없음.
 *
 * 상품 페이지에 가격·재고·별점을 구조화해 주면 검색 결과에 그대로 붙는다.
 * 쇼핑몰에서 이건 유입 경로 하나를 여는 일이다.
 *
 * **화면에 보이는 것과 같아야 한다.** 구조화 데이터에만 있는 값이나 화면과
 * 다른 가격은 구글이 스팸으로 보고 리치 결과를 아예 빼 버린다. 그래서 이
 * 파일은 화면이 이미 쓰는 값을 그대로 받아 모양만 바꾼다.
 */

/** schema.org 가 정한 재고 표기 */
export const AVAILABILITY = {
  inStock: 'https://schema.org/InStock',
  outOfStock: 'https://schema.org/OutOfStock',
} as const;

export interface ProductStructuredDataInput {
  readonly url: string;
  readonly name: string;
  readonly description: string;
  readonly brand: string;
  readonly images: readonly string[];
  readonly price: number;
  readonly soldOut: boolean;
  readonly rating: number | undefined;
  readonly reviewCount: number;
}

/**
 * 상품 구조화 데이터.
 *
 * **별점은 리뷰가 있을 때만 넣는다.** 리뷰 0건에 aggregateRating 을 붙이면
 * 구글이 오류로 잡고 그 페이지의 리치 결과를 통째로 뺀다. 없는 것이 잘못된
 * 것보다 낫다.
 */
export function productStructuredData(input: ProductStructuredDataInput): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: input.name,
    description: input.description,
    brand: { '@type': 'Brand', name: input.brand },
    ...(input.images.length > 0 ? { image: [...input.images] } : {}),
    offers: {
      '@type': 'Offer',
      url: input.url,
      priceCurrency: 'KRW',
      // 문자열로 넣는다. 숫자로 두면 파서에 따라 지수 표기로 바뀌는 일이 있다.
      price: String(input.price),
      availability: input.soldOut ? AVAILABILITY.outOfStock : AVAILABILITY.inStock,
    },
    ...(input.reviewCount > 0 && input.rating !== undefined
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            // 소수 한 자리면 충분하다. 화면도 그렇게 보여 준다.
            ratingValue: input.rating.toFixed(1),
            reviewCount: input.reviewCount,
          },
        }
      : {}),
  };
}

export interface Crumb {
  readonly name: string;
  readonly url: string;
}

/**
 * 이동 경로.
 *
 * 검색 결과의 주소 줄이 `example.com › 코트 › 울 코트` 처럼 바뀐다.
 * 화면의 빵부스러기와 **같은 순서**여야 한다.
 */
export function breadcrumbStructuredData(crumbs: readonly Crumb[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: crumb.url,
    })),
  };
}

/**
 * 사이트 자체에 대한 설명.
 *
 * 검색창(SearchAction)을 함께 알려 주면 검색 결과에 사이트 내 검색이 붙는
 * 경우가 있다. 붙지 않더라도 사이트 이름을 도메인 대신 쓰게 하는 효과가 있다.
 */
export function siteStructuredData(input: {
  readonly name: string;
  readonly url: string;
  readonly description: string;
  readonly searchPath: string;
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: input.name,
    url: input.url,
    description: input.description,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${input.url.replace(/\/+$/, '')}${input.searchPath}{search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

/**
 * 색인에서 빼야 하는 경로.
 *
 * **개인 화면과 결제 경로다.** 로그인이 막고 있어도 주소 자체는 색인될 수
 * 있고, 그러면 검색 결과에 로그인 화면이 뜬다. `/search` 는 막는 이유가
 * 다르다 — 같은 상품이 검색어마다 다른 주소로 잡혀 중복이 된다.
 */
export const DISALLOWED_PATHS: readonly string[] = [
  '/admin',
  '/mypage',
  '/cart',
  '/checkout',
  '/order',
  '/account',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/search',
  '/api',
];

/** 이 경로가 색인에서 빠져야 하는가 */
export function isDisallowedPath(pathname: string): boolean {
  return DISALLOWED_PATHS.some((base) => pathname === base || pathname.startsWith(`${base}/`));
}
