import 'server-only';
import { prisma } from '@shop/db';
import {
  checkClosure, canRequestReturn, closedAccountEmail,
  CLOSED_ACCOUNT_NAME, CLOSURE_ERROR, CLOSURE_CONFIRM_PHRASE,
  ratingScore,
  type ClosureBlock, type ClosureCheck, type ClosureErrorCode,
} from '@shop/core';

export class ClosureError extends Error {
  constructor(
    readonly code: ClosureErrorCode,
    readonly status = 400,
    readonly blocks: readonly ClosureBlock[] = [],
  ) {
    super(CLOSURE_ERROR[code]);
    this.name = 'ClosureError';
  }
}

/**
 * 지금 탈퇴할 수 있는지 본다. 화면과 API 가 같은 함수를 쓴다.
 *
 * 화면에서만 막으면 주소를 직접 부르는 요청은 그대로 통과한다. 반대로
 * API 에서만 막으면 사용자는 눌러 본 뒤에야 안 된다는 것을 안다.
 */
export async function inspectClosure(userId: string): Promise<ClosureCheck> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true, role: true },
  });
  if (!user) throw new ClosureError('ALREADY_CLOSED', 409);

  const orders = await prisma.order.findMany({
    where: { userId },
    select: { status: true, deliveredAt: true },
  });

  const now = new Date();
  return checkClosure({
    role: user.role,
    orders: orders.map((o) => ({
      status: o.status,
      // 반품 가능 여부는 이미 있는 정책을 그대로 쓴다. 여기서 다시 적으면
      // 반품 기간이 바뀔 때 한쪽만 고치게 된다.
      returnable: canRequestReturn({ status: o.status, deliveredAt: o.deliveredAt, now }),
    })),
  });
}

export interface CloseAccountInput {
  /** 확인 문구. 버튼 하나로 끝나면 안 되는 동작이다. */
  readonly phrase: string;
  /** 리뷰도 함께 지울 것인가. 기본은 남기고 이름만 지운다. */
  readonly eraseReviews: boolean;
}

export interface CloseAccountResult {
  readonly erasedReviews: number;
  readonly scrubbedOrders: number;
  readonly forfeitedPoints: number;
}

/**
 * 회원 탈퇴.
 *
 * **행을 지우지 않고 개인을 가리키는 값만 지운다.** 주문은 가맹점 정산의
 * 근거라 지우면 남의 정산이 바뀌고, 스키마도 그렇게 말한다 — Order.user 에는
 * onDelete 가 없어서 DB 가 사용자 삭제를 거절한다.
 *
 * 한 트랜잭션 안에서 끝낸다. 중간에 끊겨 이메일만 지워지고 로그인 수단이
 * 남으면 **들어갈 수는 없는데 지워지지도 않은 계정**이 된다.
 */
export async function closeAccount(
  userId: string,
  input: CloseAccountInput,
): Promise<CloseAccountResult> {
  if (input.phrase.trim() !== CLOSURE_CONFIRM_PHRASE) {
    throw new ClosureError('PHRASE_MISMATCH', 400);
  }

  const check = await inspectClosure(userId);
  if (!check.allowed) throw new ClosureError('BLOCKED', 409, check.blocks);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, pointBalance: true },
  });

  return prisma.$transaction(async (tx) => {
    /*
     * 리뷰를 지우는 경우, **상품 평점을 다시 세야 한다.**
     *
     * 지운 만큼 빼는 방식은 빠르지만 한 번 어긋나면 스스로 알아채지
     * 못한다. 리뷰 쓰기가 이미 같은 이유로 다시 세는 방식을 쓴다.
     */
    let erasedReviews = 0;
    if (input.eraseReviews) {
      const reviews = await tx.review.findMany({
        where: { userId, deletedAt: null },
        select: { id: true, productId: true },
      });

      if (reviews.length > 0) {
        await tx.review.deleteMany({ where: { id: { in: reviews.map((r) => r.id) } } });
        erasedReviews = reviews.length;

        for (const productId of new Set(reviews.map((r) => r.productId))) {
          const agg = await tx.review.aggregate({
            where: { productId, deletedAt: null },
            _sum: { rating: true },
            _count: { _all: true },
          });
          const sum = agg._sum.rating ?? 0;
          const count = agg._count._all;
          await tx.product.update({
            where: { id: productId },
            data: { ratingSum: sum, reviewCount: count, ratingScore: ratingScore(sum, count) },
          });
        }
      }
    }

    /*
     * 주문서의 배송지 스냅샷도 지운다.
     *
     * 금액·상품·상태는 정산 근거라 남기지만, 받는 사람과 연락처·주소까지
     * 남기면 "지웠다" 고 말할 수 없다. 배송이 끝나지 않은 주문은 애초에
     * 탈퇴를 막으므로 지금 지워도 배송에 문제가 생기지 않는다.
     */
    const { count: scrubbedOrders } = await tx.order.updateMany({
      where: { userId },
      data: {
        recipient: CLOSED_ACCOUNT_NAME,
        recipientPhone: '',
        postalCode: '',
        address1: '',
        address2: null,
        deliveryMemo: null,
      },
    });

    // 다시 만들면 그만인 것들. 남겨 둘 이유가 없다.
    await tx.address.deleteMany({ where: { userId } });
    await tx.cartItem.deleteMany({ where: { userId } });
    await tx.wishlistItem.deleteMany({ where: { userId } });
    await tx.restockNotification.deleteMany({ where: { userId } });
    await tx.userCoupon.deleteMany({ where: { userId, usedAt: null } });

    /*
     * 로그인 수단을 지운다.
     *
     * 세션과 계정(비밀번호 해시·구글 연결)이 함께 사라져야 들어올 길이
     * 닫힌다. 이메일을 바꾸는 것만으로는 이미 로그인해 둔 쪽이 남는다.
     */
    await tx.session.deleteMany({ where: { userId } });
    await tx.account.deleteMany({ where: { userId } });

    /*
     * 분석 이벤트에서 사람을 뗀다.
     *
     * 행은 남는다 — 퍼널 집계가 통째로 흔들리기 때문이다. 하지만 누구인지는
     * 지운다. 스키마의 onDelete: SetNull 은 사용자를 실제로 지울 때만 도는데
     * 우리는 지우지 않으므로 여기서 직접 끊어야 한다.
     */
    await tx.eventLog.updateMany({ where: { userId }, data: { userId: null } });

    /*
     * 남은 포인트는 소멸한다.
     *
     * 잔액만 0 으로 만들면 원장 합계와 어긋난다 — 그 뒤로는 대사 배치가
     * 매번 이 계정을 어긋난 것으로 잡는다. 소멸도 원장에 적는다.
     */
    const forfeitedPoints = user.pointBalance;
    if (forfeitedPoints > 0) {
      await tx.pointTransaction.create({
        data: {
          userId,
          amount: -forfeitedPoints,
          reason: 'EXPIRE',
          note: '탈퇴로 소멸',
        },
      });
    }

    await tx.user.update({
      where: { id: userId },
      data: {
        email: closedAccountEmail(userId),
        name: CLOSED_ACCOUNT_NAME,
        phone: null,
        image: null,
        emailVerified: false,
        pointBalance: 0,
        // 남은 이벤트가 이 사람 것으로 다시 묶이지 않게 명시적으로 거부로 둔다
        analyticsConsent: 'DENIED',
        deletedAt: new Date(),
      },
    });

    return { erasedReviews, scrubbedOrders, forfeitedPoints };
  });
}
