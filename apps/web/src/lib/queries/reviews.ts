import 'server-only';
import { prisma } from '@shop/db';
import { cachedRead, TAG, TTL } from '~/lib/cache';
import { ratingBreakdown, sizeFitSummary, averageRating, REVIEWABLE_STATUS } from '@shop/core';
import type { ReviewSort } from '@shop/contract';

/**
 * 리뷰 조회.
 *
 * 작성자 이름은 **가려서** 내보낸다. 리뷰는 공개 페이지에 그대로 실리므로
 * 전체 이름을 노출하면 구매 이력이 이름과 함께 공개되는 셈이다.
 */

export interface PublicReview {
  readonly id: string;
  readonly rating: number;
  readonly content: string;
  readonly sizeFit: string | null;
  readonly height: number | null;
  readonly weight: number | null;
  readonly authorName: string;
  readonly optionLabel: string | null;
  readonly createdAt: Date;
  readonly images: readonly {
    readonly url: string;
    readonly blurDataUrl: string | null;
  }[];
  /** 지금 보고 있는 사람이 쓴 리뷰인가 — 수정·삭제 버튼을 그릴지 결정한다 */
  readonly isMine: boolean;
  /** 신고할 수 있는가 — 로그인했고 내 글이 아니어야 한다 */
  readonly canReport: boolean;
  /** 도움이 됐다고 누른 사람 수 */
  readonly helpfulCount: number;
  /** 내가 이미 눌렀는가 */
  readonly helpfulByMe: boolean;
  /**
   * 내가 이미 신고했는가.
   *
   * 눌러 보고 나서 "이미 신고했습니다" 를 받는 것과, 처음부터 그렇게
   * 적혀 있는 것은 다르다. 뒤늦게 막는 화면은 사람을 두 번 헛되게 한다.
   */
  readonly reportedByMe: boolean;
}

export interface ReviewSummary {
  readonly average: number | undefined;
  readonly total: number;
  readonly breakdown: ReturnType<typeof ratingBreakdown>;
  readonly sizeFit: ReturnType<typeof sizeFitSummary>;
}

/** 가운데를 가린다. "홍길동" → "홍*동", "김하" → "김*" */
function maskAuthor(name: string): string {
  if (name.length <= 1) return name;
  if (name.length === 2) return `${name[0]}*`;
  return `${name[0]}${'*'.repeat(name.length - 2)}${name.at(-1)}`;
}

function orderFor(sort: ReviewSort) {
  switch (sort) {
    case 'helpful':
      /*
       * 표가 하나도 없을 때는 도움순이 아무 뜻이 없다. 그때 순서가 제멋대로면
       * 새로고침마다 목록이 뒤집히므로, 표가 같으면 최신순으로 이어 간다.
       */
      return [
        { helpfulCount: 'desc' as const },
        { createdAt: 'desc' as const },
        { id: 'desc' as const },
      ];
    case 'rating_desc':
      return [{ rating: 'desc' as const }, { id: 'desc' as const }];
    case 'rating_asc':
      return [{ rating: 'asc' as const }, { id: 'desc' as const }];
    default:
      return [{ createdAt: 'desc' as const }, { id: 'desc' as const }];
  }
}

const PAGE_SIZE = 10;

export async function getProductReviews(
  productId: string,
  options: { sort?: ReviewSort; cursor?: string | undefined; viewerId?: string | undefined } = {},
): Promise<{ items: PublicReview[]; nextCursor: string | null }> {
  const rows = await prisma.review.findMany({
    where: { productId, deletedAt: null },
    orderBy: orderFor(options.sort ?? 'recent'),
    take: PAGE_SIZE + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    select: {
      id: true, rating: true, content: true, sizeFit: true,
      height: true, weight: true, createdAt: true, userId: true,
      images: { select: { url: true, blurDataUrl: true }, orderBy: { sortOrder: 'asc' } },
      helpfulCount: true,
      user: { select: { name: true } },
      // 어떤 옵션을 산 사람의 후기인지가 사이즈 판단에 도움이 된다
      orderItem: { select: { optionLabel: true } },
    },
  });

  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

  /*
   * 내가 신고한 글을 따로 한 번 더 묻는다.
   *
   * 리뷰 select 안에 조건부로 넣으면 viewerId 유무에 따라 select 모양이
   * 갈리고, 그러면 Prisma 가 추론하는 타입도 갈린다. 이 목록은 한 쪽에
   * 열 건이라 질의 하나가 더 도는 편이 낫다.
   */
  const ids = page.map((r) => r.id);
  const [mineReported, mineHelpful] =
    options.viewerId === undefined || page.length === 0
      ? [new Set<string>(), new Set<string>()]
      : await Promise.all([
          prisma.reviewReport
            .findMany({
              where: { reporterId: options.viewerId, reviewId: { in: ids } },
              select: { reviewId: true },
            })
            .then((rows) => new Set(rows.map((r) => r.reviewId))),
          /*
           * 내가 누른 것도 한 번에 묻는다. 카드마다 물으면 리뷰 수만큼
           * 질의가 나간다 — 찜 목록을 한 번에 가져오는 것과 같다.
           */
          prisma.reviewHelpful
            .findMany({
              where: { userId: options.viewerId, reviewId: { in: ids } },
              select: { reviewId: true },
            })
            .then((rows) => new Set(rows.map((r) => r.reviewId))),
        ]);

  return {
    items: page.map((r) => ({
      id: r.id,
      rating: r.rating,
      content: r.content,
      sizeFit: r.sizeFit,
      height: r.height,
      weight: r.weight,
      authorName: maskAuthor(r.user.name),
      optionLabel: r.orderItem?.optionLabel ?? null,
      createdAt: r.createdAt,
      images: r.images,
      isMine: options.viewerId !== undefined && r.userId === options.viewerId,
      canReport: options.viewerId !== undefined && r.userId !== options.viewerId,
      reportedByMe: mineReported.has(r.id),
      helpfulCount: r.helpfulCount,
      helpfulByMe: mineHelpful.has(r.id),
    })),
    nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
  };
}

/**
 * 상품 리뷰 요약.
 *
 * 분포는 별점별로 세어 온다. 상품 행의 ratingSum·reviewCount 는 평균에만
 * 쓸 수 있고, 5점이 몇 개인지는 알려 주지 않는다.
 */
/**
 * 요약에 쓰는 집계 두 개.
 *
 * **사용자와 무관한 값만 있다.** 이 파일의 다른 조회(getProductReviews)는
 * viewerId 를 받아 "내 리뷰인지"를 담으므로 절대 캐싱하면 안 된다 —
 * 한 사람의 화면이 다음 사람에게 그대로 나간다.
 */
const reviewAggregates = cachedRead(
  (productId: string) =>
    Promise.all([
    prisma.review.groupBy({
      by: ['rating'],
      where: { productId, deletedAt: null },
      _count: { _all: true },
    }),
    prisma.review.findMany({
      where: { productId, deletedAt: null, sizeFit: { not: null } },
      select: { sizeFit: true },
      take: 500,
    }),
    ]),
  { key: ['review-summary'], tags: [TAG.catalog], revalidate: TTL.catalog },
);

export async function getReviewSummary(productId: string): Promise<ReviewSummary> {
  const [byRating, fits] = await reviewAggregates(productId);

  const counts: Record<number, number> = {};
  let sum = 0;
  let total = 0;
  for (const row of byRating) {
    counts[row.rating] = row._count._all;
    sum += row.rating * row._count._all;
    total += row._count._all;
  }

  return {
    average: averageRating(sum, total),
    total,
    breakdown: ratingBreakdown(counts),
    sizeFit: sizeFitSummary(fits.map((f) => f.sizeFit)),
  };
}

export interface ReviewableItem {
  readonly orderItemId: string;
  readonly orderNo: string;
  readonly productSlug: string;
  readonly productName: string;
  readonly brandName: string;
  readonly optionLabel: string;
  readonly imageUrl: string | null;
  readonly deliveredAt: Date | null;
}

/** 리뷰를 쓸 수 있는 주문 항목 — 배송이 끝났고 아직 안 쓴 것 */
export async function getReviewableItems(userId: string): Promise<ReviewableItem[]> {
  const items = await prisma.orderItem.findMany({
    where: {
      order: { userId, status: { in: [...REVIEWABLE_STATUS] } },
      review: null,
      /*
       * 돈이 돌아간 줄은 산 것이 아니다. 주문은 배송완료여도 그 줄은 출고 전에 취소됐거나 받은 뒤
       * 반품·환불됐다 — 거르지 않으면 돌려보낸 니트에 후기를 쓰게 된다.
       */
      canceledAt: null,
    },
    orderBy: { order: { deliveredAt: 'desc' } },
    take: 50,
    select: {
      id: true, productName: true, brandName: true, optionLabel: true, imageUrl: true,
      order: { select: { orderNo: true, deliveredAt: true } },
      variant: { select: { product: { select: { slug: true } } } },
    },
  });

  return items.map((i) => ({
    orderItemId: i.id,
    orderNo: i.order.orderNo,
    productSlug: i.variant.product.slug,
    productName: i.productName,
    brandName: i.brandName,
    optionLabel: i.optionLabel,
    imageUrl: i.imageUrl,
    deliveredAt: i.order.deliveredAt,
  }));
}
