import 'server-only';
import { prisma } from '@shop/db';
import { won, type Actor, type Won, type ProductStatus, LOW_STOCK_THRESHOLD,
} from '@shop/core';
import {
  assertAdminQuery, scopeOf, PAGE_SIZE, MAX_PAGE_SIZE, type Paged,
} from './scope';

// ── 상품 ──────────────────────────────────────────────────────

export interface AdminProductRow {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly brandName: string;
  readonly categoryName: string;
  readonly listPrice: Won;
  readonly salePrice: Won | null;
  readonly status: string;
  readonly totalStock: number;
  readonly lowStock: boolean;
  readonly createdAt: Date;
  /** 검수를 요청한 시각. 대기줄 정렬에 쓴다. */
  readonly reviewRequestedAt: Date | null;
  readonly publishRejection: string | null;
}

export async function getAdminProducts(
  actor: Actor,
  query: { cursor?: string | undefined; take?: number; status?: ProductStatus | undefined } = {},
): Promise<Paged<AdminProductRow> & { readonly awaitingReview: number }> {
  assertAdminQuery(actor, 'product:read');
  const scope = scopeOf(actor);
  const take = Math.min(query.take ?? PAGE_SIZE, MAX_PAGE_SIZE);

  const scoped = { deletedAt: null, ...(scope ? { brand: { merchantId: scope } } : {}) };
  const where = { ...scoped, ...(query.status ? { status: query.status } : {}) };

  const [rows, total] = await Promise.all([
    prisma.product.findMany({
    where,
    /*
     * 검수 대기만 보고 있을 때는 **오래 기다린 것부터** 꺼낸다. 다른
     * 목록과 같은 최신순으로 두면 새로 들어온 요청이 계속 앞을 막는다.
     */
    orderBy:
      query.status === 'PENDING_REVIEW'
        ? [{ reviewRequestedAt: 'asc' as const }, { id: 'asc' as const }]
        : [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
    take: take + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    select: {
      id: true, slug: true, name: true, listPrice: true, salePrice: true,
      status: true, createdAt: true, reviewRequestedAt: true, publishRejection: true,
      brand: { select: { name: true } },
      category: { select: { name: true } },
      variants: { select: { stock: true }, where: { isActive: true } },
    },
    }),
    prisma.product.count({ where }),
  ]);

  // 탭에 붙는 숫자. 필터와 무관하게 범위 안의 대기 건수를 센다.
  const awaitingReview = await prisma.product.count({
    where: { ...scoped, status: 'PENDING_REVIEW' },
  });

  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;

  return {
    rows: page.map((p) => ({
      id: p.id, slug: p.slug, name: p.name,
      brandName: p.brand.name, categoryName: p.category.name,
      listPrice: won(p.listPrice),
      salePrice: p.salePrice === null ? null : won(p.salePrice),
      status: p.status,
      totalStock: p.variants.reduce((s, v) => s + v.stock, 0),
      lowStock: p.variants.some((v) => v.stock > 0 && v.stock <= LOW_STOCK_THRESHOLD),
      createdAt: p.createdAt,
      reviewRequestedAt: p.reviewRequestedAt,
      publishRejection: p.publishRejection,
    })),
    nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
    total,
    awaitingReview,
  };
}

// ── 상품 상세 (수정 화면) ──────────────────────────────────────

export interface AdminProductDetail {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly brandId: string;
  readonly brandName: string;
  readonly categoryId: string;
  readonly categoryName: string;
  readonly listPrice: Won;
  readonly salePrice: Won | null;
  readonly status: string;
  /** 지난 반려 사유. 고치는 화면에서 보여야 무엇을 고칠지 안다. */
  readonly publishRejection: string | null;
  readonly variants: readonly {
    readonly id: string;
    readonly sku: string;
    readonly optionLabel: string;
    readonly stock: number;
    readonly isActive: boolean;
  }[];
}

export async function getAdminProductDetail(
  actor: Actor,
  productId: string,
): Promise<AdminProductDetail | null> {
  assertAdminQuery(actor, 'product:read');
  const scope = scopeOf(actor);

  const p = await prisma.product.findFirst({
    where: {
      id: productId,
      deletedAt: null,
      ...(scope ? { brand: { merchantId: scope } } : {}),
    },
    select: {
      id: true, slug: true, name: true, description: true,
      listPrice: true, salePrice: true, status: true, publishRejection: true,
      brand: { select: { id: true, name: true } },
      category: { select: { id: true, name: true } },
      variants: {
        orderBy: { sku: 'asc' },
        select: { id: true, sku: true, label: true, stock: true, isActive: true },
      },
    },
  });
  if (!p) return null;

  return {
    id: p.id, slug: p.slug, name: p.name, description: p.description,
    brandId: p.brand.id, brandName: p.brand.name,
    categoryId: p.category.id, categoryName: p.category.name,
    listPrice: won(p.listPrice),
    salePrice: p.salePrice === null ? null : won(p.salePrice),
    status: p.status,
    publishRejection: p.publishRejection,
    variants: p.variants.map((v) => ({
      id: v.id, sku: v.sku, optionLabel: v.label, stock: v.stock, isActive: v.isActive,
    })),
  };
}
