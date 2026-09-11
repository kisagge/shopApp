import 'server-only';
import { Prisma } from '@shop/db';
import { discountRateOf, searchWords, won, VISIBLE_STATUS, type Won } from '@shop/core';

/*
 * 카탈로그 질의가 공유하는 바닥.
 *
 * 어느 질의든 "무엇이 매대에 보이는가"(onDisplay · sellableBrand)와
 * "그것이 카드로 어떻게 보이는가"(listSelect · toListItem)를 함께 쓴다.
 * 두 짝을 한 파일에 두는 이유는 **listSelect 가 고르는 필드와 toListItem 이
 * 읽는 필드가 같아야 하기 때문**이다 — 떨어뜨려 두면 한쪽만 고쳐진다.
 */

/**
 * 매대에 보이는 상품의 조건.
 *
 * **네 쿼리가 모두 이것을 쓴다.** 손으로 적어 두었더니 목록과 검색에는
 * 상태 조건이 있는데 상세와 정적 경로에는 빠져 있었다. 그래서 숨긴 상품이
 * 주소로는 그대로 열렸다 — 회수한 상품이나 잘못된 가격을 내려도 링크를
 * 가진 사람에게는 계속 보인다.
 */
export const onDisplay = (): Prisma.ProductWhereInput => ({
  deletedAt: null,
  publishedAt: { not: null },
  // 배열을 복사해 넘긴다 — readonly 를 그대로 주면 Prisma 입력 타입과 어긋나고,
  // 그 여파로 select 추론이 통째로 무너진다(search.ts 의 catalogPage 와 같은 함정).
  status: { in: [...VISIBLE_STATUS] },
});

/**
 * 화면이 쓰는 모양. Prisma 모델을 그대로 컴포넌트에 넘기지 않는다 —
 * 스키마가 바뀔 때마다 화면이 따라 깨지고, 화면에 필요 없는 필드까지
 * 서버-클라이언트 경계를 넘어간다.
 */
export interface ProductListItem {
  readonly id: string;
  readonly slug: string;
  readonly brand: string;
  /** 이 상품이 실제로 속한 갈래. 비교는 같은 갈래끼리만 한다. */
  readonly categorySlug: string;
  readonly name: string;
  readonly price: Won;
  readonly listPrice: Won | undefined;
  readonly discountPercent: number | undefined;
  readonly rating: number | undefined;
  readonly reviewCount: number;
  readonly soldOut: boolean;
  readonly isNew: boolean;
  readonly imageUrl: string | undefined;
  readonly imageAlt: string | undefined;
  readonly blurDataUrl: string | undefined;
}

/** 등록 30일 이내면 NEW */
const NEW_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export const listSelect = {
  id: true,
  slug: true,
  name: true,
  listPrice: true,
  salePrice: true,
  ratingSum: true,
  reviewCount: true,
  publishedAt: true,
  brand: { select: { name: true } },
  category: { select: { slug: true } },
  images: {
    select: { url: true, alt: true, blurDataUrl: true },
    orderBy: { sortOrder: 'asc' },
    take: 1,
  },
  variants: { select: { stock: true }, where: { isActive: true } },
} as const;

/**
 * 팔 수 있는 브랜드 — 승인된 가맹점의 것이거나 자사 직매입(가맹점 없음).
 * 가맹점을 정지시켰는데 상품이 계속 팔리면 처분이 처분이 아니다.
 */
export function sellableBrand() {
  return { OR: [{ merchantId: null }, { merchant: { status: 'APPROVED' as const } }] };
}

type ListRow = {
  id: string;
  slug: string; name: string; listPrice: number; salePrice: number | null;
  ratingSum: number; reviewCount: number;
  /**
   * 캐시를 지나므로 **Date 가 아니라 문자열**로 올 수 있다.
   *
   * 캐시는 값을 JSON 으로 저장한다. Date 로 선언해 두었더니 캐싱을 붙인
   * 순간 홈이 통째로 500 이 났다 — getTime is not a function.
   */
  publishedAt: Date | string | null;
  brand: { name: string };
  category: { slug: string };
  images: { url: string; alt: string; blurDataUrl: string | null }[];
  variants: { stock: number }[];
};

/** 캐시를 지나온 값은 문자열일 수 있다. 양쪽을 같게 다룬다. */
const epochOf = (value: Date | string): number =>
  value instanceof Date ? value.getTime() : new Date(value).getTime();

export function toListItem(p: ListRow, now: number): ProductListItem {
  const listPrice = won(p.listPrice);
  const price = p.salePrice === null ? listPrice : won(p.salePrice);
  // 표시 할인율은 저장하지 않고 두 값에서 계산한다
  const rate = discountRateOf(listPrice, price);

  const image = p.images[0];
  return {
    id: p.id,
    slug: p.slug,
    brand: p.brand.name,
    categorySlug: p.category.slug,
    name: p.name,
    price,
    listPrice: rate > 0 ? listPrice : undefined,
    discountPercent: rate > 0 ? rate : undefined,
    // 리뷰가 없으면 평점을 만들어 내지 않는다. 0.0으로 표시하면 나쁜 상품처럼 보인다.
    rating: p.reviewCount > 0 ? p.ratingSum / p.reviewCount : undefined,
    reviewCount: p.reviewCount,
    soldOut: p.variants.length > 0 && p.variants.every((v) => v.stock <= 0),
    isNew: p.publishedAt !== null && now - epochOf(p.publishedAt) < NEW_WINDOW_MS,
    imageUrl: image?.url,
    imageAlt: image?.alt,
    blurDataUrl: image?.blurDataUrl ?? undefined,
  };
}

/**
 * 검색어를 Prisma 조건으로 바꾼다.
 *
 * **네 곳이 같은 조건을 써야 한다** — 목록·자동완성·색과 사이즈 칩·브랜드 칩.
 * 하나만 고치면 "울 코트" 로 상품 하나가 나오는데 그 옆 브랜드 칩은 비는
 * 식으로 화면이 스스로 어긋난다.
 *
 * 낱말로 쪼개는 규칙은 core 가 정한다(`searchWords`). 여기서는 그 낱말들을
 * 전부 담고 있어야 한다는 조건으로 옮기기만 한다.
 *
 * **상품명과 브랜드명을 합쳐 둔 한 컬럼을 본다.** 두 테이블에 OR 를 걸면
 * Postgres 가 어느 인덱스도 못 쓰고 전체를 훑는다. 소문자로 저장해 두므로
 * 낱말도 소문자로 맞춘다(searchWords 가 한다).
 */
export function searchWhere(term: string): Prisma.ProductWhereInput {
  return { AND: searchWords(term).map((word) => ({ searchText: { contains: word } })) };
}
