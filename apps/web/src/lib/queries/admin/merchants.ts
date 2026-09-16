import 'server-only';
import { prisma } from '@shop/db';
import { assertPermission, hasSettlementAccount, offsetOf, type Actor } from '@shop/core';
import { assertAdminQuery, scopeOf } from './scope';
import { clampToLastPage } from '../paged';

// ── 가맹점·회원 (슈퍼관리자 화면) ─────────────────────────────

export interface MerchantRow {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly businessName: string;
  readonly businessNumber: string;
  readonly representative: string;
  readonly contactEmail: string;
  readonly contactPhone: string;
  readonly commissionPercent: number;
  readonly brandNames: readonly string[];
  /** 신청서에 적은 브랜드 이름. 운영진이 직접 만든 가맹점에는 없다. */
  readonly appliedBrandName: string | null;
  /** 신청한 사람. 승인하면 이 계정이 가맹점 계정이 된다. */
  readonly applicant: { readonly name: string; readonly email: string } | null;
  readonly userCount: number;
  readonly approvedAt: Date | null;
  readonly createdAt: Date;
  /** 반품지를 등록했는가. 없으면 이 가맹점 상품의 반품을 승인할 수 없다 */
  readonly hasReturnAddress: boolean;
  /** 정산 계좌를 등록했는가. 없으면 확정된 정산을 지급할 수 없다 */
  readonly hasSettlementAccount: boolean;
}

export async function getMerchants(actor: Actor): Promise<MerchantRow[]> {
  assertAdminQuery(actor, 'merchant:read');
  const scope = scopeOf(actor);

  const rows = await prisma.merchant.findMany({
    // 가맹점 계정은 자기 정보만 본다
    where: scope ? { id: scope } : {},
    // 승인 대기가 위로 와야 할 일이 눈에 띈다
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 100,
    select: {
      id: true, name: true, status: true,
      businessName: true, businessNumber: true, representative: true,
      contactEmail: true, contactPhone: true, commissionPercent: true,
      approvedAt: true, createdAt: true,
      // 신청으로 들어온 건인지, 운영진이 직접 만든 것인지 구분한다
      brandName: true,
      applicant: { select: { name: true, email: true } },
      brands: { select: { name: true } },
      _count: { select: { users: true } },
      returnAddress: { select: { id: true } },
      settlementBank: true, settlementAccount: true, settlementHolder: true,
    },
  });

  return rows.map((m) => ({
    id: m.id, name: m.name, status: m.status,
    businessName: m.businessName,
    // 사업자번호는 뒤 두 자리만 가린다. 대조에는 쓰되 그대로 흘리지는 않는다.
    businessNumber: m.businessNumber.replace(/\d{2}$/, '**'),
    representative: m.representative,
    contactEmail: m.contactEmail,
    contactPhone: m.contactPhone,
    commissionPercent: m.commissionPercent,
    brandNames: m.brands.map((b) => b.name),
    appliedBrandName: m.brandName,
    applicant: m.applicant,
    userCount: m._count.users,
    approvedAt: m.approvedAt,
    createdAt: m.createdAt,
    hasReturnAddress: m.returnAddress !== null,
    hasSettlementAccount: hasSettlementAccount(m),
  }));
}

export interface AdminUserRow {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: string;
  readonly merchantId: string | null;
  readonly merchantName: string | null;
  readonly orderCount: number;
  readonly createdAt: Date;
  /** 탈퇴 시각. 행은 남으므로 목록에서 구분할 수 있어야 한다. */
  readonly closedAt: Date | null;
  /** 이용 정지 시각과 사유. 정지를 건 사람은 감사 로그에 있다 */
  readonly suspendedAt: Date | null;
  readonly suspendedReason: string | null;
  /** 적립금 잔액. 누르면 수동 지급·차감 화면으로 간다 */
  readonly pointBalance: number;
}

export interface AdminUserPage {
  readonly rows: readonly AdminUserRow[];
  /** 조건에 맞는 전체 회원 수. 쪽 수가 이 값에서 나온다 */
  readonly total: number;
}

export async function getAdminUsers(
  actor: Actor,
  query: { q?: string | undefined; page?: number; take?: number } = {},
): Promise<AdminUserPage> {
  assertPermission(actor, 'user:read');

  const take = Math.min(query.take ?? 25, 50);
  const q = query.q?.trim();

  const where = q
    ? {
        OR: [
          { email: { contains: q, mode: 'insensitive' as const } },
          { name: { contains: q, mode: 'insensitive' as const } },
        ],
      }
    : {};

  const page = query.page ?? 1;
  const readAt = (at: number) =>
    prisma.user.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take,
    skip: offsetOf(at, take),
    select: {
      id: true, name: true, email: true, role: true, createdAt: true, deletedAt: true,
      suspendedAt: true, suspendedReason: true, pointBalance: true,
      merchant: { select: { id: true, name: true } },
      _count: { select: { orders: true } },
    },
    });

  const [first, total] = await Promise.all([readAt(page), prisma.user.count({ where })]);
  // 검색어를 좁히면 쪽 수가 줄어든다 — 그때 빈 표 대신 마지막 쪽을 준다
  const rows = await clampToLastPage(first, { page, pageSize: take, total }, readAt);

  return {
    rows: rows.map((u) => ({
      id: u.id, name: u.name, email: u.email, role: u.role,
      merchantId: u.merchant?.id ?? null,
      merchantName: u.merchant?.name ?? null,
      orderCount: u._count.orders,
      createdAt: u.createdAt,
      closedAt: u.deletedAt,
      suspendedAt: u.suspendedAt,
      suspendedReason: u.suspendedReason,
      pointBalance: u.pointBalance,
    })),
    total,
  };
}

/** 권한 부여 폼이 쓰는 가맹점 선택지 — 승인된 곳만 */
export async function getApprovedMerchants(
  actor: Actor,
): Promise<readonly { id: string; name: string }[]> {
  assertPermission(actor, 'user:assignRole');
  return prisma.merchant.findMany({
    where: { status: 'APPROVED' },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
}

// ── 가맹점 하나 (상세 화면) ───────────────────────────────────

export interface MerchantDetail extends MerchantRow {
  /**
   * 반려 사유.
   *
   * **목록에는 자리가 없었다.** 신청한 사람은 신청 화면에서 보는데 정작 반려한
   * 운영진은 나중에 이유를 못 봤다 — 감사 로그를 뒤지는 수밖에 없었다.
   */
  readonly rejectionReason: string | null;
  /** 이 가맹점 브랜드로 올라간 상품 수. 보관한 것은 빼고 센다 */
  readonly productCount: number;
  /** 확정됐는데 아직 지급되지 않은 정산 건수 — 계좌가 없으면 이것들이 묶인다 */
  readonly settlementCount: number;
  readonly staff: readonly { readonly id: string; readonly name: string; readonly email: string }[];
}

/**
 * 가맹점 하나를 자세히.
 *
 * **목록은 한 줄에 다 담을 수 없다.** 신청서에 적어 낸 것, 지금 상태와 그 이유,
 * 붙어 있는 것들(브랜드·계정·상품·정산)을 한자리에서 보는 화면이 따로 있어야
 * "이 가맹점이 지금 어떤 상태인가" 에 답할 수 있다.
 *
 * 가맹점 계정도 이 화면에 들어온다 — 다만 **자기 것만** 본다(scopeOf).
 */
export async function getMerchantDetail(actor: Actor, id: string): Promise<MerchantDetail | null> {
  assertAdminQuery(actor, 'merchant:read');
  const scope = scopeOf(actor);

  // 남의 가맹점은 주소로도 못 연다 — 없는 것과 같이 다룬다
  if (scope !== null && scope !== id) return null;

  const m = await prisma.merchant.findUnique({
    where: { id },
    select: {
      id: true, name: true, status: true,
      businessName: true, businessNumber: true, representative: true,
      contactEmail: true, contactPhone: true, commissionPercent: true,
      approvedAt: true, createdAt: true, rejectionReason: true,
      brandName: true,
      applicant: { select: { name: true, email: true } },
      brands: { select: { name: true } },
      users: { orderBy: { createdAt: 'asc' }, select: { id: true, name: true, email: true } },
      returnAddress: { select: { id: true } },
      settlementBank: true, settlementAccount: true, settlementHolder: true,
      _count: {
        select: {
          users: true,
          // 확정됐는데 아직 지급되지 않은 정산. 계좌가 없으면 이것들이 묶여 있다는 뜻이다
          settlements: { where: { status: 'CONFIRMED' } },
        },
      },
    },
  });
  if (!m) return null;

  const productCount = await prisma.product.count({
    where: { brand: { merchantId: id }, deletedAt: null },
  });

  return {
    id: m.id, name: m.name, status: m.status,
    businessName: m.businessName,
    // 목록과 같은 규칙으로 가린다 — 대조에는 쓰되 그대로 흘리지는 않는다
    businessNumber: m.businessNumber.replace(/\d{2}$/, '**'),
    representative: m.representative,
    contactEmail: m.contactEmail,
    contactPhone: m.contactPhone,
    commissionPercent: m.commissionPercent,
    brandNames: m.brands.map((b) => b.name),
    appliedBrandName: m.brandName,
    applicant: m.applicant,
    userCount: m._count.users,
    approvedAt: m.approvedAt,
    createdAt: m.createdAt,
    hasReturnAddress: m.returnAddress !== null,
    hasSettlementAccount: hasSettlementAccount(m),
    rejectionReason: m.rejectionReason,
    productCount,
    settlementCount: m._count.settlements,
    staff: m.users,
  };
}
