import 'server-only';
import { prisma } from '@shop/db';
import { won, type Actor, type Won, type ProductStatus, type ProductArchiver, LOW_STOCK_THRESHOLD,
  offsetOf,
} from '@shop/core';
import {
  assertAdminQuery, scopeOf, PAGE_SIZE, MAX_PAGE_SIZE, type Paged,
} from './scope';
import { clampToLastPage } from '../paged';

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
  /**
   * 이 상품의 재입고를 기다리는 사람 수.
   *
   * **아무도 세지 않던 값이다.** 손님이 품절 옵션에 알림을 걸면 행이 쌓이고
   * `@@index([variantId, notifiedAt])` 까지 만들어 두었는데, 파는 쪽에서는
   * 그것을 볼 창구가 없었다 — 무엇을 먼저 채울지 정하는 사람에게 가장 직접적인
   * 숫자인데도. 이미 알림을 받은 건은 빼고 센다. 그건 기다리는 상태가 아니다.
   */
  readonly waitingRestock: number;
  readonly createdAt: Date;
  /** 검수를 요청한 시각. 대기줄 정렬에 쓴다. */
  readonly reviewRequestedAt: Date | null;
  readonly publishRejection: string | null;
  /** 보관한 때와 보관한 쪽. 보관함에서만 채워진다 */
  readonly archivedAt: Date | null;
  readonly archivedBy: ProductArchiver | null;
}

export async function getAdminProducts(
  actor: Actor,
  query: {
    page?: number;
    take?: number;
    status?: ProductStatus | undefined;
    /** 보관함을 본다. 상태 필터와 함께 쓰지 않는다 — 보관한 상품은 상태와 상관없이 한 곳에 모인다 */
    archived?: boolean;
  } = {},
): Promise<Paged<AdminProductRow> & { readonly awaitingReview: number; readonly archivedCount: number }> {
  assertAdminQuery(actor, 'product:read');
  const scope = scopeOf(actor);
  const take = Math.min(query.take ?? PAGE_SIZE, MAX_PAGE_SIZE);

  const inScope = scope ? { brand: { merchantId: scope } } : {};
  const scoped = { deletedAt: null, ...inScope };
  const archivedWhere = { deletedAt: { not: null }, ...inScope };
  const where = query.archived
    ? archivedWhere
    : { ...scoped, ...(query.status ? { status: query.status } : {}) };

  const page = query.page ?? 1;
  const readAt = (at: number) =>
    prisma.product.findMany({
    where,
    /*
     * 검수 대기만 보고 있을 때는 **오래 기다린 것부터** 꺼낸다. 다른
     * 목록과 같은 최신순으로 두면 새로 들어온 요청이 계속 앞을 막는다.
     */
    orderBy: query.archived
      // 보관함은 최근에 넣은 것부터 — 잘못 넣은 것을 되돌리러 온 사람이 바로 찾는다
      ? [{ deletedAt: 'desc' as const }, { id: 'desc' as const }]
      : query.status === 'PENDING_REVIEW'
        ? [{ reviewRequestedAt: 'asc' as const }, { id: 'asc' as const }]
        : [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
    take,
    skip: offsetOf(at, take),
    select: {
      id: true, slug: true, name: true, listPrice: true, salePrice: true,
      status: true, createdAt: true, reviewRequestedAt: true, publishRejection: true,
      deletedAt: true, archivedBy: true,
      brand: { select: { name: true } },
      category: { select: { name: true } },
      variants: {
        select: {
          stock: true,
          // 기다리는 사람 수. 이미 알림을 받은 건(notifiedAt)은 끝난 건이라 뺀다
          _count: { select: { restockAlerts: { where: { notifiedAt: null } } } },
        },
        where: { isActive: true },
      },
    },
    });

  // 목록·전체 수·탭 숫자(대기·보관)는 서로 기다릴 이유가 없다 — 한 번에 묻는다
  const [first, total, awaitingReview, archivedCount] = await Promise.all([
    readAt(page),
    prisma.product.count({ where }),
    // 탭에 붙는 숫자. 필터와 무관하게 범위 안의 대기·보관 건수를 센다.
    prisma.product.count({ where: { ...scoped, status: 'PENDING_REVIEW' } }),
    prisma.product.count({ where: archivedWhere }),
  ]);
  // 탭을 옮기면 쪽 수가 줄어든다 — 그때 빈 표 대신 마지막 쪽을 준다
  const rows = await clampToLastPage(first, { page, pageSize: take, total }, readAt);

  return {
    rows: rows.map((p) => ({
      id: p.id, slug: p.slug, name: p.name,
      brandName: p.brand.name, categoryName: p.category.name,
      listPrice: won(p.listPrice),
      salePrice: p.salePrice === null ? null : won(p.salePrice),
      status: p.status,
      totalStock: p.variants.reduce((s, v) => s + v.stock, 0),
      lowStock: p.variants.some((v) => v.stock > 0 && v.stock <= LOW_STOCK_THRESHOLD),
      waitingRestock: p.variants.reduce((s, v) => s + v._count.restockAlerts, 0),
      createdAt: p.createdAt,
      reviewRequestedAt: p.reviewRequestedAt,
      publishRejection: p.publishRejection,
      archivedAt: p.deletedAt,
      archivedBy: p.archivedBy,
    })),
    total,
    awaitingReview,
    archivedCount,
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
    /** 이 옵션의 재입고를 기다리는 사람 수 — 얼마나 채울지 정하는 자리에 놓는다 */
    readonly waitingRestock: number;
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
        select: {
          id: true, sku: true, label: true, stock: true, isActive: true,
          // 기다리는 사람. 이미 알림을 받은 건은 끝난 건이라 뺀다
          _count: { select: { restockAlerts: { where: { notifiedAt: null } } } },
        },
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
      waitingRestock: v._count.restockAlerts,
    })),
  };
}
