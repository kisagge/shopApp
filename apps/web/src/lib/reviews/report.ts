import 'server-only';
import { prisma } from '@shop/db';
import { REVIEW_REPORT_ERROR, type ReviewReportErrorCode } from '@shop/core';
import type { ReportReviewInput } from '@shop/contract';

export class ReviewReportError extends Error {
  constructor(readonly code: ReviewReportErrorCode, readonly status = 400) {
    super(REVIEW_REPORT_ERROR[code]);
    this.name = 'ReviewReportError';
  }
}

/**
 * 리뷰를 신고한다.
 *
 * 한 사람이 같은 리뷰를 여러 번 신고할 수 없다. 유니크 제약이 DB 에서도
 * 한 번 더 막는다 — 동시에 두 번 눌리면 여기 검사만으로는 둘 다 통과한다.
 */
export async function reportReview(
  reporterId: string,
  reviewId: string,
  input: ReportReviewInput,
): Promise<{ reported: true }> {
  const review = await prisma.review.findFirst({
    where: { id: reviewId, deletedAt: null },
    select: { id: true, userId: true },
  });
  if (!review) throw new ReviewReportError('REPORT_TARGET_GONE', 404);

  /*
   * 내 글은 신고할 수 없다.
   *
   * 막지 않으면 지우고 싶은 글을 스스로 신고해 대기줄에 올릴 수 있다.
   * 지우는 문은 따로 있다 — 본인 삭제는 확인 한 번이면 된다.
   */
  if (review.userId === reporterId) throw new ReviewReportError('CANNOT_REPORT_OWN', 403);

  try {
    await prisma.reviewReport.create({
      data: { reviewId, reporterId, reason: input.reason, detail: input.detail },
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new ReviewReportError('ALREADY_REPORTED', 409);
    throw error;
  }

  return { reported: true };
}

/**
 * 신고를 "문제없음" 으로 닫는다.
 *
 * 글은 그대로 두고 대기줄에서만 뺀다. 지운 것과 구분해서 남겨야 나중에
 * 같은 글이 다시 신고됐을 때 "전에 한 번 보고 넘긴 글" 임을 알 수 있다.
 */
export async function dismissReports(
  actorId: string,
  reviewId: string,
): Promise<{ dismissed: number }> {
  const { count } = await prisma.reviewReport.updateMany({
    where: { reviewId, resolvedAt: null },
    data: { resolvedAt: new Date(), resolvedById: actorId, resolution: 'kept' },
  });

  if (count === 0) throw new ReviewReportError('NOTHING_TO_DISMISS', 409);
  return { dismissed: count };
}

/**
 * 글을 내렸을 때 신고를 함께 닫는다.
 *
 * 남겨 두면 이미 끝난 건이 대기줄에 계속 남아 같은 일을 두 번 처리하게
 * 된다. 실패해도 삭제를 되돌리지 않는다 — 글이 내려간 것이 먼저다.
 */
export async function closeReportsAsRemoved(actorId: string, reviewId: string): Promise<void> {
  try {
    await prisma.reviewReport.updateMany({
      where: { reviewId, resolvedAt: null },
      data: { resolvedAt: new Date(), resolvedById: actorId, resolution: 'removed' },
    });
  } catch {
    // 대기줄에 한 줄 남는 것뿐이다. 다음에 처리하면 된다.
  }
}

/** Prisma 의 유니크 제약 위반(P2002) */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}
