import 'server-only';
import { prisma } from '@shop/db';
import { assertPermission, type Actor } from '@shop/core';
import { assertAdminQuery, scopeOf } from './scope';

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
}

export interface AdminUserPage {
  readonly rows: readonly AdminUserRow[];
  readonly nextCursor: string | null;
}

export async function getAdminUsers(
  actor: Actor,
  query: { q?: string | undefined; cursor?: string | undefined; take?: number } = {},
): Promise<AdminUserPage> {
  assertPermission(actor, 'user:read');

  const take = Math.min(query.take ?? 25, 50);
  const q = query.q?.trim();

  const rows = await prisma.user.findMany({
    where: q
      ? {
          OR: [
            { email: { contains: q, mode: 'insensitive' } },
            { name: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {},
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: take + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    select: {
      id: true, name: true, email: true, role: true, createdAt: true, deletedAt: true,
      suspendedAt: true, suspendedReason: true,
      merchant: { select: { id: true, name: true } },
      _count: { select: { orders: true } },
    },
  });

  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;

  return {
    rows: page.map((u) => ({
      id: u.id, name: u.name, email: u.email, role: u.role,
      merchantId: u.merchant?.id ?? null,
      merchantName: u.merchant?.name ?? null,
      orderCount: u._count.orders,
      createdAt: u.createdAt,
      closedAt: u.deletedAt,
      suspendedAt: u.suspendedAt,
      suspendedReason: u.suspendedReason,
    })),
    nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
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
