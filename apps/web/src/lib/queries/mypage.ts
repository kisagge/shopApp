import 'server-only';
import { prisma } from '@shop/db';
import { getEffectiveGrade } from '~/lib/grade/effective';
import { clampToLastPage } from './paged';
import {
  gradeProgress, won, ORDER_STATUS, offsetOf, expiringSoonAmount, pointExpirySchedule, REVIEWABLE_STATUS,
  canWriteReview,
  type Actor, type PointExpiryDay,
  type DateRange, type MemberGrade, type MyOrderSearchTerm, type OrderStatus, type Won,
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
  /** 마케팅 정보 수신에 동의한 상태인가. 철회 토글이 처음 그릴 값이다 */
  readonly marketingOptIn: boolean;
}

export async function getMyPageSummary(actor: Actor): Promise<MyPageSummary | null> {
  const userId = actor.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, grade: true, pointBalance: true, marketingAgreedAt: true },
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
    /*
     * 배송완료됐는데 아직 리뷰를 안 쓴 항목.
     *
     * **파는 사람에게는 세지 않는다.** 목록(getReviewableItems)과 같은 조건이어야
     * 숫자가 맞는데, 그 목록은 파는 사람에게 비어 있다 — 뱃지에 3 이 떠서 들어가면
     * 아무것도 없는 화면을 만난다. 취소·반품된 줄을 빼는 것도 같은 이유다.
     */
    canWriteReview(actor)
      ? prisma.orderItem.count({
        where: {
          order: { userId, status: { in: [...REVIEWABLE_STATUS] } },
          review: null,
          canceledAt: null,
        },
      })
      : 0,
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
    marketingOptIn: user.marketingAgreedAt !== null,
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
export interface MyOrderFilter {
  /**
   * 걸러 볼 상태들. **하나도 묶음도 같은 모양으로 받는다** — 부르는 쪽이
   * "취소·반품" 처럼 여럿을 묶은 칸을 다시 나누지 않게 하려는 것이다.
   * 목록을 무엇으로 펴는지는 core 의 orderFilterStatuses 가 정한다.
   */
  readonly statuses?: readonly OrderStatus[] | null;
  /** 주문번호이거나 상품명. 어느 쪽인지는 core 의 readMyOrderSearch 가 읽는다 */
  readonly search?: MyOrderSearchTerm;
  /** 주문한 날 기준. 끝날을 포함한다 — readDateRange 가 그렇게 만든다 */
  readonly range?: DateRange;
}

/** 주문 내역 한 쪽의 줄 수 */
export const MY_ORDER_PAGE_SIZE = 20;

/**
 * 목록 한 쪽.
 *
 * **잘라 놓고 말하지 않았다.** 주문은 최근 20건, 포인트는 30건, 리뷰는 50건, 문의는 10건까지만 보였고
 * 그 뒤가 있다는 표시도 없었다 — 오래 산 손님일수록 지난 주문을 찾을 길이 없었다. 전체 수를 함께 싣고
 * 쪽 번호로 넘긴다(알림함·운영 목록과 같은 PageNav).
 */
export interface MyPage<T> {
  readonly items: readonly T[];
  readonly total: number;
}

export async function getMyOrders(
  userId: string,
  filter: MyOrderFilter = {},
  options: { page?: number; take?: number } = {},
): Promise<MyPage<MyOrderSummary>> {
  const { statuses, search, range } = filter;

  /*
   * **완전한 주문번호는 정확히 일치로 찾는다.** orderNo 에 유니크 인덱스가
   * 있어서 부분 일치로 던지면 그 인덱스를 못 쓰고 전체를 훑는다. 운영자
   * 검색이 같은 판단을 한다.
   *
   * 상품명은 **주문 항목의 스냅샷**을 본다. 지금 상품 이름이 아니라 살 때
   * 찍힌 이름이다 — 그 사이에 이름이 바뀌었어도 사람이 기억하는 것은 그때
   * 이름이고, 주문은 애초에 그 값을 안고 있다.
   */
  const searchWhere =
    search === undefined || search.kind === 'none'
      ? {}
      : search.kind === 'orderNo'
        ? { orderNo: search.value }
        : search.kind === 'orderNoPartial'
          ? { orderNo: { contains: search.value } }
          : {
              items: {
                some: { productName: { contains: search.value, mode: 'insensitive' as const } },
              },
            };

  const placedAt =
    range && (range.from || range.until)
      ? {
          placedAt: {
            ...(range.from ? { gte: range.from } : {}),
            ...(range.until ? { lt: range.until } : {}),
          },
        }
      : {};

  const where = {
    userId,
    ...(statuses && statuses.length > 0 ? { status: { in: [...statuses] } } : {}),
    ...searchWhere,
    ...placedAt,
  };
  const size = options.take ?? MY_ORDER_PAGE_SIZE;
  const page = options.page ?? 1;
  const read = (at: number) =>
    prisma.order.findMany({
      where,
      // 같은 시각에 들어온 주문이 쪽을 넘길 때 겹치거나 빠지지 않게 주문번호로 한 번 더 줄 세운다
      orderBy: [{ placedAt: 'desc' }, { orderNo: 'desc' }],
      skip: offsetOf(at, size),
      take: size,
      select: {
        orderNo: true, status: true, placedAt: true, payable: true,
        items: {
          select: { productName: true, brandName: true, optionLabel: true },
          orderBy: { id: 'asc' },
        },
      },
    });

  const [first, total] = await Promise.all([read(page), prisma.order.count({ where })]);
  // 즐겨찾기에 담아 둔 쪽은 조건을 바꾸거나 주문이 줄면 사라진다 — 빈 화면 대신 마지막 쪽을 준다
  const orders = await clampToLastPage(first, { page, pageSize: size, total }, read);

  const items = orders.map((o) => ({
    orderNo: o.orderNo,
    status: o.status,
    placedAt: o.placedAt,
    payable: won(o.payable),
    itemCount: o.items.length,
    firstItemName: o.items[0]?.productName ?? '(상품 없음)',
    firstItemBrand: o.items[0]?.brandName ?? '',
    firstItemOption: o.items[0]?.optionLabel ?? '',
  }));
  return { items, total };
}

export const isOrderStatus = (value: string): value is OrderStatus =>
  (ORDER_STATUS as readonly string[]).includes(value);

export interface PointEntry {
  readonly amount: number;
  readonly reason: string;
  readonly note: string | null;
  readonly createdAt: Date;
}

/** 포인트 내역 한 쪽의 줄 수 */
export const POINT_HISTORY_PAGE_SIZE = 30;

export async function getPointHistory(userId: string, page = 1): Promise<MyPage<PointEntry>> {
  const read = (at: number) =>
    prisma.pointTransaction.findMany({
      where: { userId },
      // 같은 순간에 적힌 줄(취소 환불과 쿠폰 복원 등)이 쪽마다 흔들리지 않게 id 로 마저 가른다
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: offsetOf(at, POINT_HISTORY_PAGE_SIZE),
      take: POINT_HISTORY_PAGE_SIZE,
      select: { amount: true, reason: true, note: true, createdAt: true },
    });
  const [first, total] = await Promise.all([read(page), prisma.pointTransaction.count({ where: { userId } })]);
  const items = await clampToLastPage(first, { page, pageSize: POINT_HISTORY_PAGE_SIZE, total }, read);
  return { items, total };
}

/**
 * 곧 사라질 포인트와 날짜별 소멸 예정.
 *
 * 어떤 사용이 어떤 적립을 썼는지는 원장에 적혀 있지 않아서 core 가 기한이 가까운 것부터 소진했다고 본다.
 * 원장을 **한 번** 읽어 둘 다 낸다 — 한 줄 요약과 날짜별 표가 같은 원장에서 나와야 합이 맞는다.
 */
export async function getPointExpiry(
  userId: string,
  now = new Date(),
): Promise<{ soon: number; schedule: PointExpiryDay[] }> {
  const entries = await prisma.pointTransaction.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: { amount: true, createdAt: true, expiresAt: true },
  });
  return { soon: expiringSoonAmount(entries, now), schedule: pointExpirySchedule(entries, now) };
}
