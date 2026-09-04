import 'server-only';
import { prisma } from '@shop/db';

/**
 * 도움이 됐다고 누르기.
 *
 * **토글이 아니라 켜기와 끄기를 따로 둔다.** 토글은 다시 보내면 뒤집히므로,
 * 네트워크가 끊겨 클라이언트가 같은 요청을 한 번 더 보내면 표가 사라진다.
 * 켜기를 두 번 보내도 켜진 채로 남는 편이 안전하다.
 *
 * **세는 값은 표와 같은 트랜잭션에서 고친다.** 따로 두면 한쪽만 성공했을 때
 * 화면의 숫자와 실제 표가 갈라지고, 그 뒤로는 무엇이 맞는지 알 수 없다.
 */

export class HelpfulError extends Error {
  constructor(
    readonly code: 'REVIEW_NOT_FOUND' | 'OWN_REVIEW',
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HelpfulError';
  }
}

async function loadVotable(reviewId: string, userId: string) {
  const review = await prisma.review.findFirst({
    where: { id: reviewId, deletedAt: null },
    select: { id: true, userId: true },
  });
  if (!review) throw new HelpfulError('REVIEW_NOT_FOUND', 404, '리뷰를 찾을 수 없습니다.');
  /*
   * 자기 글에는 누를 수 없다. 막지 않으면 도움순이 "스스로 누른 횟수" 순이
   * 되어, 정렬을 만든 뜻이 없어진다.
   */
  if (review.userId === userId) {
    throw new HelpfulError('OWN_REVIEW', 403, '내가 쓴 리뷰에는 누를 수 없습니다.');
  }
  return review;
}

/** 켠다. 이미 켜져 있으면 아무 일도 일어나지 않는다. */
export async function markHelpful(reviewId: string, userId: string): Promise<number> {
  await loadVotable(reviewId, userId);

  return prisma.$transaction(async (tx) => {
    /*
     * 넣어 보고 **몇 줄이 들어갔는지로** 이미 눌렀는지를 판단한다. 먼저 읽고
     * 나서 넣으면 그 사이에 같은 요청이 하나 더 들어와 둘 다 "없다" 로 읽고
     * 둘 다 세는 값을 올린다.
     */
    const inserted = await tx.reviewHelpful.createMany({
      data: [{ reviewId, userId }],
      skipDuplicates: true,
    });
    if (inserted.count === 0) {
      const row = await tx.review.findUniqueOrThrow({
        where: { id: reviewId },
        select: { helpfulCount: true },
      });
      return row.helpfulCount;
    }

    const updated = await tx.review.update({
      where: { id: reviewId },
      data: { helpfulCount: { increment: 1 } },
      select: { helpfulCount: true },
    });
    return updated.helpfulCount;
  });
}

/** 끈다. 이미 꺼져 있으면 아무 일도 일어나지 않는다. */
export async function unmarkHelpful(reviewId: string, userId: string): Promise<number> {
  await loadVotable(reviewId, userId);

  return prisma.$transaction(async (tx) => {
    const removed = await tx.reviewHelpful.deleteMany({ where: { reviewId, userId } });
    if (removed.count === 0) {
      const row = await tx.review.findUniqueOrThrow({
        where: { id: reviewId },
        select: { helpfulCount: true },
      });
      return row.helpfulCount;
    }

    /*
     * 0 보다 클 때만 내린다. 조건 없이 내리면 어긋난 상태에서 음수가 되고,
     * 음수가 된 값은 정렬을 뒤집는다 — 포인트 차감과 같은 규칙이다.
     */
    await tx.review.updateMany({
      where: { id: reviewId, helpfulCount: { gt: 0 } },
      data: { helpfulCount: { decrement: 1 } },
    });
    const row = await tx.review.findUniqueOrThrow({
      where: { id: reviewId },
      select: { helpfulCount: true },
    });
    return row.helpfulCount;
  });
}
