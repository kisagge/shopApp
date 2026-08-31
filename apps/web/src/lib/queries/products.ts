import 'server-only';
import { prisma } from '@shop/db';
import { percentOf, won, type Won } from '@shop/core';

/**
 * 화면이 쓰는 모양. Prisma 모델을 그대로 컴포넌트에 넘기지 않는다 —
 * 스키마가 바뀔 때마다 화면이 따라 깨지고, 화면에 필요 없는 필드까지
 * 서버-클라이언트 경계를 넘어간다.
 */
export interface ProductListItem {
  readonly slug: string;
  readonly brand: string;
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
}

/** 등록 30일 이내면 NEW */
const NEW_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

const listSelect = {
  slug: true,
  name: true,
  listPrice: true,
  discountPercent: true,
  ratingSum: true,
  reviewCount: true,
  publishedAt: true,
  brand: { select: { name: true } },
  images: { select: { url: true, alt: true }, orderBy: { sortOrder: 'asc' }, take: 1 },
  variants: { select: { stock: true }, where: { isActive: true } },
} as const;

type ListRow = {
  slug: string; name: string; listPrice: number; discountPercent: number;
  ratingSum: number; reviewCount: number; publishedAt: Date | null;
  brand: { name: string };
  images: { url: string; alt: string }[];
  variants: { stock: number }[];
};

function toListItem(p: ListRow, now: number): ProductListItem {
  const listPrice = won(p.listPrice);
  const price = p.discountPercent > 0
    ? won(listPrice - percentOf(listPrice, p.discountPercent))
    : listPrice;

  const image = p.images[0];
  return {
    slug: p.slug,
    brand: p.brand.name,
    name: p.name,
    price,
    listPrice: p.discountPercent > 0 ? listPrice : undefined,
    discountPercent: p.discountPercent > 0 ? p.discountPercent : undefined,
    // 리뷰가 없으면 평점을 만들어 내지 않는다. 0.0으로 표시하면 나쁜 상품처럼 보인다.
    rating: p.reviewCount > 0 ? p.ratingSum / p.reviewCount : undefined,
    reviewCount: p.reviewCount,
    soldOut: p.variants.length > 0 && p.variants.every((v) => v.stock <= 0),
    isNew: p.publishedAt !== null && now - p.publishedAt.getTime() < NEW_WINDOW_MS,
    imageUrl: image?.url,
    imageAlt: image?.alt,
  };
}

/** 홈 화면 — 많이 팔린 순 */
export async function getFeaturedProducts(limit = 8): Promise<ProductListItem[]> {
  const rows = await prisma.product.findMany({
    where: { deletedAt: null, publishedAt: { not: null }, status: { in: ['ACTIVE', 'SOLD_OUT'] } },
    orderBy: [{ soldCount: 'desc' }, { publishedAt: 'desc' }],
    take: limit,
    select: listSelect,
  });
  const now = Date.now();
  return rows.map((r) => toListItem(r as ListRow, now));
}

/** 카테고리 목록 — 하위 카테고리까지 포함해서 조회 */
export async function getProductsByCategory(
  categorySlug: string,
  limit = 24,
): Promise<ProductListItem[]> {
  const category = await prisma.category.findUnique({
    where: { slug: categorySlug },
    select: { id: true, children: { select: { id: true } } },
  });
  if (!category) return [];

  const categoryIds = [category.id, ...category.children.map((c) => c.id)];
  const rows = await prisma.product.findMany({
    where: {
      deletedAt: null, publishedAt: { not: null },
      status: { in: ['ACTIVE', 'SOLD_OUT'] },
      categoryId: { in: categoryIds },
    },
    orderBy: [{ soldCount: 'desc' }],
    take: limit,
    select: listSelect,
  });
  const now = Date.now();
  return rows.map((r) => toListItem(r as ListRow, now));
}

/** 헤더 내비게이션용 최상위 카테고리 */
export async function getTopCategories(): Promise<{ slug: string; name: string }[]> {
  return prisma.category.findMany({
    where: { parentId: null },
    orderBy: { sortOrder: 'asc' },
    select: { slug: true, name: true },
  });
}
