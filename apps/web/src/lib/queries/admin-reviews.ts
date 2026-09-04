import 'server-only';
import { prisma } from '@shop/db';
import {
  assertPermission, moderationState, reportPriority,
  type Actor, type ModerationState, type ReportReason,
} from '@shop/core';

/**
 * 리뷰 관리 조회.
 *
 * **가맹점은 여기 들어오지 못한다.** `review:moderate` 는 관리자 이상만
 * 갖는다 — 자기 상품의 혹평을 내릴 수 있는 사람이 그 상품을 파는 사람이면
 * 리뷰가 상품 설명의 일부가 된다.
 */

export interface ReportRow {
  readonly id: string;
  readonly reason: ReportReason;
  readonly detail: string | null;
  readonly reporterName: string;
  readonly createdAt: Date;
  readonly resolvedAt: Date | null;
  readonly resolution: string | null;
}

export interface AdminReviewRow {
  readonly id: string;
  readonly rating: number;
  readonly content: string;
  readonly imageCount: number;
  readonly createdAt: Date;
  readonly authorName: string;
  readonly productId: string;
  readonly productName: string;
  readonly state: ModerationState;
  readonly openReports: number;
  readonly reports: readonly ReportRow[];
  /** 처리 순서 점수. 대기줄 정렬에만 쓴다. */
  readonly priority: number;
}

export interface AdminReviewList {
  readonly rows: readonly AdminReviewRow[];
  readonly nextCursor: string | null;
  /** 대기줄에 남은 건수. 탭에 붙는다. */
  readonly pending: number;
  /** 대기줄이 상한에 걸렸는가 */
  readonly capped: boolean;
}

export const REVIEW_TAB = ['reported', 'all', 'removed'] as const;
export type ReviewTab = (typeof REVIEW_TAB)[number];

export const REVIEW_TAB_LABEL: Readonly<Record<ReviewTab, string>> = {
  reported: '처리 대기',
  all: '전체',
  removed: '내려간 글',
};

export function isReviewTab(value: string | undefined): value is ReviewTab {
  return value !== undefined && (REVIEW_TAB as readonly string[]).includes(value);
}

const PAGE_SIZE = 25;

/**
 * 대기줄 상한.
 *
 * 처리 순서는 core 의 `reportPriority` 가 정하는데, 그 점수는 SQL 로 표현할
 * 수 없다(사유별 최댓값 + 건수). 그래서 대기 중인 것을 가져와 메모리에서
 * 정렬한다. 상한을 두지 않으면 신고가 몰릴 때 이 조회가 통째로 무거워진다.
 *
 * 상한에 걸리면 화면이 그렇게 말한다 — 조용히 자르면 아래쪽 건이 영영
 * 처리되지 않는다.
 */
const QUEUE_CAP = 200;

const reviewSelect = {
  id: true, rating: true, content: true, imageUrls: true,
  createdAt: true, deletedAt: true, productId: true,
  user: { select: { name: true } },
  product: { select: { name: true } },
  reports: {
    orderBy: { createdAt: 'desc' as const },
    select: {
      id: true, reason: true, detail: true, createdAt: true,
      resolvedAt: true, resolution: true,
      reporter: { select: { name: true } },
    },
  },
} as const;

type RawReview = {
  id: string; rating: number; content: string; imageUrls: string[];
  createdAt: Date; deletedAt: Date | null; productId: string;
  user: { name: string };
  product: { name: string };
  reports: {
    id: string; reason: ReportReason; detail: string | null; createdAt: Date;
    resolvedAt: Date | null; resolution: string | null;
    reporter: { name: string };
  }[];
};

function toRow(raw: RawReview): AdminReviewRow {
  const open = raw.reports.filter((r) => r.resolvedAt === null);

  return {
    id: raw.id,
    rating: raw.rating,
    content: raw.content,
    imageCount: raw.imageUrls.length,
    createdAt: raw.createdAt,
    authorName: maskName(raw.user.name),
    productId: raw.productId,
    productName: raw.product.name,
    state: moderationState({
      removedByModerator: raw.deletedAt !== null,
      openReports: open.length,
      totalReports: raw.reports.length,
    }),
    openReports: open.length,
    reports: raw.reports.map((r) => ({
      id: r.id,
      reason: r.reason,
      detail: r.detail,
      // 신고자도 사람이다. 운영진에게도 이름을 통째로 보여 줄 이유가 없다.
      reporterName: maskName(r.reporter.name),
      createdAt: r.createdAt,
      resolvedAt: r.resolvedAt,
      resolution: r.resolution,
    })),
    priority: reportPriority(open),
  };
}

export async function getAdminReviews(
  actor: Actor,
  query: { tab?: ReviewTab; q?: string | undefined; cursor?: string | undefined } = {},
): Promise<AdminReviewList> {
  assertPermission(actor, 'review:moderate');

  const tab = query.tab ?? 'reported';
  const term = query.q?.trim();

  /**
   * 검색은 상품명이거나 작성자 이름이다.
   *
   * 어느 쪽인지 고르라고 묻지 않는다 — 운영자가 손에 쥔 것은 "어느 상품"
   * 이거나 "누가" 이고, 둘은 겹치지 않는 이름 공간이다. 주문 검색이
   * 주문번호와 이름을 값의 모양으로 가르는 것과 같은 결이다.
   */
  const search = term
    ? {
        OR: [
          { product: { name: { contains: term, mode: 'insensitive' as const } } },
          { user: { name: { contains: term, mode: 'insensitive' as const } } },
        ],
      }
    : {};

  const pending = await prisma.review.count({
    where: { deletedAt: null, reports: { some: { resolvedAt: null } } },
  });

  if (tab === 'reported') {
    /*
     * 대기줄은 **목록이 아니라 처리할 일감**이다. 그래서 페이지를 넘기지
     * 않고 상한까지 한 번에 보여 준다. 우선순위대로 위에서부터 내려가는
     * 것이 이 화면의 사용법이다.
     */
    const raw = (await prisma.review.findMany({
      where: { deletedAt: null, reports: { some: { resolvedAt: null } }, ...search },
      orderBy: { createdAt: 'desc' },
      take: QUEUE_CAP + 1,
      select: reviewSelect,
    })) as RawReview[];

    const capped = raw.length > QUEUE_CAP;
    const rows = raw
      .slice(0, QUEUE_CAP)
      .map(toRow)
      // 점수가 같으면 오래 기다린 것부터. 새 신고가 계속 앞을 막으면 안 된다.
      .sort((a, b) => b.priority - a.priority || a.createdAt.getTime() - b.createdAt.getTime());

    return { rows, nextCursor: null, pending, capped };
  }

  const where =
    tab === 'removed'
      ? { deletedAt: { not: null }, ...search }
      : { deletedAt: null, ...search };

  const raw = (await prisma.review.findMany({
    where,
    // 같은 시각에 들어온 리뷰의 순서가 흔들리면 커서가 행을 건너뛴다
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: PAGE_SIZE + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    select: reviewSelect,
  })) as RawReview[];

  const hasMore = raw.length > PAGE_SIZE;
  const page = hasMore ? raw.slice(0, PAGE_SIZE) : raw;

  return {
    rows: page.map(toRow),
    nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
    pending,
    capped: false,
  };
}

/** 어드민 목록의 이름 표기 규칙. queries/admin.ts 와 같다. */
function maskName(name: string): string {
  if (name.length <= 1) return name;
  if (name.length === 2) return `${name[0]}○`;
  return `${name[0]}${'○'.repeat(name.length - 2)}${name.at(-1)}`;
}
