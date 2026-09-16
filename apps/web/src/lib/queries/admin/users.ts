import 'server-only';
import { prisma } from '@shop/db';
import { actorLabel, assertPermission, type Actor, type MemberGrade, type OrderStatus, type UserRole } from '@shop/core';
import { getEffectiveGrade } from '~/lib/grade/effective';
import { loadActors } from './actors';

/** 한 번에 보여 줄 최근 주문·운영 기록 수. 더 보려면 주문·감사 로그 화면으로 간다 */
export const USER_DETAIL_RECENT = 10;

export interface AdminUserDetail {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly phone: string | null;
  readonly role: UserRole;
  readonly merchantName: string | null;
  /** 비밀번호로 가입했는가, 구글로 가입했는가 — 로그인이 안 된다는 문의에 먼저 묻는 것 */
  readonly signInMethods: readonly string[];
  readonly grade: MemberGrade;
  readonly totalSpent: number;
  readonly createdAt: Date;
  readonly closedAt: Date | null;
  readonly suspendedAt: Date | null;
  readonly suspendedReason: string | null;
  /**
   * 정지를 건 사람(core 의 actorLabel). 정지 중이 아니면 null.
   * **적어 두기만 했다** — 사유는 화면에 있는데 건 사람은 감사 로그를 뒤져야 나왔다.
   */
  readonly suspendedBy: string | null;
  readonly pointBalance: number;
  readonly counts: {
    readonly orders: number;
    readonly reviews: number;
    readonly inquiries: number;
    readonly inquiriesWaiting: number;
    readonly coupons: number;
    readonly wishlist: number;
  };
  readonly recentOrders: readonly {
    readonly orderNo: string;
    readonly status: OrderStatus;
    readonly payable: number;
    readonly placedAt: Date;
    readonly itemCount: number;
  }[];
  readonly audit: readonly {
    readonly id: string;
    readonly action: string;
    readonly actorName: string;
    readonly createdAt: Date;
  }[];
}

/**
 * 회원 한 사람을 한 화면에.
 *
 * 문의가 오면 운영자는 주문 화면·포인트 화면·감사 로그를 오가며 한 사람을 맞춰 봤다. 여기서는 **판단에 필요한 것의
 * 요약**만 모은다 — 긴 목록은 각자의 화면이 갖고, 여기는 최근 것과 거기로 가는 길을 둔다.
 *
 * 등급과 누적 구매액은 주문 견적이 쓰는 함수(getEffectiveGrade)에서 낸다. 여기서 따로 세면 운영자가 본 등급과 손님이
 * 받은 적립률이 갈린다.
 *
 * 운영 기록은 **이 회원을 대상으로 한 것**이다(정지·권한·포인트 조정). 이 사람이 운영진으로서 한 일은 감사 로그의
 * 행위자 필터가 갖는다.
 */
export async function getAdminUserDetail(actor: Actor, userId: string, now = new Date()): Promise<AdminUserDetail | null> {
  assertPermission(actor, 'user:read');

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, name: true, email: true, emailVerified: true, phone: true, role: true, grade: true,
      createdAt: true, deletedAt: true, suspendedAt: true, suspendedReason: true, suspendedBy: true, pointBalance: true,
      merchant: { select: { name: true } },
      accounts: { select: { providerId: true } },
      _count: { select: { orders: true, reviews: true, wishlist: true } },
    },
  });
  if (!user) return null;

  const [effective, inquiries, inquiriesWaiting, coupons, recentOrders, audit, suspenders] = await Promise.all([
    getEffectiveGrade(user.id, user.grade),
    prisma.inquiry.count({ where: { authorId: user.id, deletedAt: null } }),
    prisma.inquiry.count({ where: { authorId: user.id, deletedAt: null, answeredAt: null } }),
    prisma.userCoupon.count({ where: { userId: user.id, usedAt: null, expiresAt: { gt: now } } }),
    prisma.order.findMany({
      where: { userId: user.id },
      orderBy: [{ placedAt: 'desc' }, { id: 'desc' }],
      take: USER_DETAIL_RECENT,
      select: { orderNo: true, status: true, payable: true, placedAt: true, _count: { select: { items: true } } },
    }),
    prisma.adminAuditLog.findMany({
      where: { targetType: 'user', targetId: user.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: USER_DETAIL_RECENT,
      select: { id: true, action: true, createdAt: true, actorLabel: true, actor: { select: { name: true } } },
    }),
    loadActors([user.suspendedAt ? user.suspendedBy : null]),
  ]);

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    phone: user.phone,
    role: user.role,
    merchantName: user.merchant?.name ?? null,
    signInMethods: [...new Set(user.accounts.map((a) => a.providerId))].sort(),
    grade: effective.grade,
    totalSpent: effective.totalSpent,
    createdAt: user.createdAt,
    closedAt: user.deletedAt,
    suspendedAt: user.suspendedAt,
    suspendedReason: user.suspendedReason,
    suspendedBy: user.suspendedAt === null
      ? null
      : actorLabel(actor, {
        id: user.suspendedBy,
        identity: user.suspendedBy ? suspenders.get(user.suspendedBy) ?? null : null,
      }, '기록 없음'),
    pointBalance: user.pointBalance,
    counts: {
      orders: user._count.orders,
      reviews: user._count.reviews,
      inquiries,
      inquiriesWaiting,
      coupons,
      wishlist: user._count.wishlist,
    },
    recentOrders: recentOrders.map((o) => ({
      orderNo: o.orderNo, status: o.status, payable: o.payable, placedAt: o.placedAt, itemCount: o._count.items,
    })),
    audit: audit.map((a) => ({
      id: a.id,
      action: a.action,
      // 배치가 한 일이면 사람이 없다 — 남긴 이름표를 쓴다
      actorName: a.actor?.name ?? a.actorLabel ?? '자동 실행',
      createdAt: a.createdAt,
    })),
  };
}
