import 'server-only';
import { prisma } from '@shop/db';
import { getEffectiveGrade } from '~/lib/grade/effective';
import {
  gradeProgress, won, ORDER_STATUS, type MemberGrade, type OrderStatus, type Won,
} from '@shop/core';

/** 마이페이지 상단의 주문 처리 현황 — 시안의 5칸 */
export const TRACKED_STATUSES = [
  'PENDING', 'PAID', 'PREPARING', 'SHIPPED', 'DELIVERED',
] as const satisfies readonly OrderStatus[];

export interface MyPageSummary {
  readonly name: string;
  readonly email: string;
  readonly grade: MemberGrade;
  readonly gradeProgress: ReturnType<typeof gradeProgress>;
  readonly pointBalance: Won;
  readonly couponCount: number;
  readonly wishlistCount: number;
  readonly reviewableCount: number;
  readonly statusCounts: Readonly<Record<(typeof TRACKED_STATUSES)[number], number>>;
}

export async function getMyPageSummary(userId: string): Promise<MyPageSummary | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, grade: true, pointBalance: true },
  });
  if (!user) return null;

  const now = new Date();

  const [effective, counts, couponCount, wishlistCount, reviewableCount] = await Promise.all([
    /*
     * 등급과 적립률은 **견적이 쓰는 것과 같은 함수**에서 낸다.
     *
     * 여기서 따로 계산하던 때에는 화면이 "적립률 3%" 라고 적어 놓고 실제
     * 주문에는 기본 1% 가 붙었다. 같은 곳에서 내면 그렇게 갈라질 수 없다.
     */
    getEffectiveGrade(userId, user.grade),
    prisma.order.groupBy({
      by: ['status'],
      where: { userId, status: { in: [...TRACKED_STATUSES] } },
      _count: { _all: true },
    }),
    prisma.userCoupon.count({ where: { userId, usedAt: null, expiresAt: { gt: now } } }),
    prisma.wishlistItem.count({ where: { userId } }),
    // 배송완료됐는데 아직 리뷰를 안 쓴 항목
    prisma.orderItem.count({
      where: {
        order: { userId, status: { in: ['DELIVERED', 'CONFIRMED'] } },
        review: null,
      },
    }),
  ]);

  const statusCounts = Object.fromEntries(
    TRACKED_STATUSES.map((s) => [s, counts.find((c) => c.status === s)?._count._all ?? 0]),
  ) as MyPageSummary['statusCounts'];

  const progress = gradeProgress(effective.totalSpent, effective.grade);

  return {
    name: user.name,
    email: user.email,
    // 화면에는 실제로 적용되는 등급을 보여 준다. DB 값만 쓰면 구매로 올라간
    // 등급이 반영되지 않는다.
    grade: progress.current,
    gradeProgress: progress,
    pointBalance: won(user.pointBalance),
    couponCount,
    wishlistCount,
    reviewableCount,
    statusCounts,
  };
}

export interface MyOrderSummary {
  readonly orderNo: string;
  readonly status: OrderStatus;
  readonly placedAt: Date;
  readonly payable: Won;
  readonly itemCount: number;
  readonly firstItemName: string;
  readonly firstItemBrand: string;
  readonly firstItemOption: string;
}

/** 주문 내역. status 를 주면 그 상태만 거른다. */
export async function getMyOrders(
  userId: string,
  status?: OrderStatus,
  take = 20,
): Promise<MyOrderSummary[]> {
  const orders = await prisma.order.findMany({
    where: { userId, ...(status ? { status } : {}) },
    orderBy: { placedAt: 'desc' },
    take,
    select: {
      orderNo: true, status: true, placedAt: true, payable: true,
      items: {
        select: { productName: true, brandName: true, optionLabel: true },
        orderBy: { id: 'asc' },
      },
    },
  });

  return orders.map((o) => ({
    orderNo: o.orderNo,
    status: o.status,
    placedAt: o.placedAt,
    payable: won(o.payable),
    itemCount: o.items.length,
    firstItemName: o.items[0]?.productName ?? '(상품 없음)',
    firstItemBrand: o.items[0]?.brandName ?? '',
    firstItemOption: o.items[0]?.optionLabel ?? '',
  }));
}

export const isOrderStatus = (value: string): value is OrderStatus =>
  (ORDER_STATUS as readonly string[]).includes(value);

export interface PointEntry {
  readonly amount: number;
  readonly reason: string;
  readonly note: string | null;
  readonly createdAt: Date;
}

export async function getPointHistory(userId: string, take = 30): Promise<PointEntry[]> {
  return prisma.pointTransaction.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take,
    select: { amount: true, reason: true, note: true, createdAt: true },
  });
}
