import 'server-only';
import { prisma } from '@shop/db';
import {
  effectiveGrade, won, GRADE_REWARD_PERCENT,
  type MemberGrade, type Won,
} from '@shop/core';

/**
 * 지금 이 사람에게 실제로 적용되는 등급.
 *
 * **화면에 보여 주는 등급과 적립에 쓰는 등급이 같은 곳에서 나와야 한다.**
 * 마이페이지는 등급을 계산해 &ldquo;적립률 3%&rdquo; 라고 적는데 견적은 등급을
 * 보지도 않고 기본 1% 로 계산하고 있었다 — 화면이 약속한 것과 실제로 주는
 * 것이 달랐다. 두 곳이 이 함수를 함께 쓰면 그렇게 갈라질 수 없다.
 */
export interface EffectiveGrade {
  readonly grade: MemberGrade;
  /** 등급 산정의 기준이 된 누적 구매액 */
  readonly totalSpent: Won;
  readonly rewardPercent: number;
}

/**
 * 등급 산정의 기준.
 *
 * **구매확정된 금액만 센다.** 주문하고 취소하기를 반복해 등급을 올리는 것을
 * 막는다. 마이페이지가 쓰던 기준을 그대로 옮겼다 — 여기서 다르게 세면
 * 화면의 진행 막대와 적립률이 서로 다른 등급을 말하게 된다.
 */
async function totalSpentOf(userId: string): Promise<Won> {
  const spent = await prisma.order.aggregate({
    where: { userId, status: 'CONFIRMED' },
    _sum: { payable: true },
  });
  return won(spent._sum.payable ?? 0);
}

/**
 * storedGrade 를 넘기면 사용자 행을 다시 읽지 않는다.
 *
 * 마이페이지는 이미 사용자를 읽은 뒤라 한 번 더 읽을 이유가 없다.
 */
export async function getEffectiveGrade(
  userId: string,
  storedGrade?: MemberGrade,
): Promise<EffectiveGrade> {
  const [totalSpent, stored] = await Promise.all([
    totalSpentOf(userId),
    storedGrade !== undefined
      ? Promise.resolve(storedGrade)
      : prisma.user
          .findUnique({ where: { id: userId }, select: { grade: true } })
          .then((u) => u?.grade ?? 'BASIC'),
  ]);

  const grade = effectiveGrade(totalSpent, stored);
  return { grade, totalSpent, rewardPercent: GRADE_REWARD_PERCENT[grade] };
}

export interface QuoteViewer {
  readonly id: string;
  readonly pointBalance: number;
  readonly rewardPercent: number;
}

/**
 * 견적에 넘길 사람.
 *
 * 포인트 잔액과 적립률을 함께 낸다. **잔액은 세션 캐시가 아니라 DB 를
 * 본다** — 세션 캐시가 5분이라 그동안 다른 주문에서 쓴 포인트가 반영되지
 * 않을 수 있다. 등급도 같은 이유로 여기서 낸다.
 *
 * 견적과 주문 생성이 같은 함수를 쓴다. 한쪽만 고치면 화면에 보여 준 적립
 * 예정 금액과 실제로 쌓이는 금액이 갈라진다.
 */
export async function getQuoteViewer(userId: string): Promise<QuoteViewer | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, pointBalance: true, grade: true },
  });
  if (!user) return null;

  const { rewardPercent } = await getEffectiveGrade(user.id, user.grade);
  return { id: user.id, pointBalance: user.pointBalance, rewardPercent };
}
