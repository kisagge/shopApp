import 'server-only';
import { prisma } from '@shop/db';
import { assertPermission, canAssignRole, canEditUser, type Actor, type UserRole } from '@shop/core';
import {
  ADMIN_ERROR_MESSAGE,
  type AdminErrorCode,
  type AssignRoleInput,
  type MerchantStatusInput,
  type UpdateMerchantStatusInput,
} from '@shop/contract';

/**
 * 반환 타입을 직접 적는다. Prisma 가 만들어 내는 enum 타입은 생성 디렉터리에
 * 있어 추론에 맡기면 앱 밖에서 이름을 지을 수 없다(TS2883).
 */
interface MerchantSnapshot {
  readonly id: string;
  readonly name: string;
  readonly status: MerchantStatusInput;
  readonly approvedAt: Date | null;
}

interface UserSnapshot {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: UserRole;
  readonly merchantId: string | null;
}

export class AccessError extends Error {
  constructor(readonly code: AdminErrorCode, readonly status = 409) {
    super(ADMIN_ERROR_MESSAGE[code]);
    this.name = 'AccessError';
  }
}

/**
 * 입점 승인·정지.
 *
 * 승인 시각은 **처음 승인할 때만** 찍는다. 정지했다 푸는 것은 재입점이
 * 아니므로 최초 입점일이 밀리면 안 된다 — 정산 기간 계산의 기준이다.
 */
export async function updateMerchantStatus(
  actor: Actor,
  merchantId: string,
  input: UpdateMerchantStatusInput,
): Promise<{ before: MerchantSnapshot; after: MerchantSnapshot }> {
  assertPermission(actor, 'merchant:approve');

  const before = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { id: true, name: true, status: true, approvedAt: true },
  });
  if (!before) throw new AccessError('MERCHANT_NOT_FOUND', 404);

  const after = await prisma.merchant.update({
    where: { id: merchantId },
    data: {
      status: input.status,
      ...(input.status === 'APPROVED' && before.approvedAt === null
        ? { approvedAt: new Date() }
        : {}),
    },
    select: { id: true, name: true, status: true, approvedAt: true },
  });

  return { before, after };
}

/**
 * 권한 부여.
 *
 * 슈퍼관리자만 할 수 있고 **자기 권한은 못 바꾼다**. 관리자에게 이 권한이
 * 없는 것과 같은 이유다 — 한 사람이 스스로 권한을 올려 완결하는 경로를
 * 남기지 않는다.
 */
export async function assignRole(
  actor: Actor,
  userId: string,
  input: AssignRoleInput,
): Promise<{
  before: { role: UserRole; merchantId: string | null };
  after: UserSnapshot;
}> {
  assertPermission(actor, 'user:assignRole');

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, merchantId: true },
  });
  if (!target) throw new AccessError('USER_NOT_FOUND', 404);

  if (!canAssignRole(actor, target, input.role as UserRole)) {
    throw new AccessError('CANNOT_CHANGE_OWN_ROLE', 403);
  }
  if (!canEditUser(actor, { id: target.id, role: target.role as UserRole })) {
    throw new AccessError('CANNOT_EDIT_SUPER_ADMIN', 403);
  }

  if (input.merchantId !== null) {
    const merchant = await prisma.merchant.findUnique({
      where: { id: input.merchantId },
      select: { status: true },
    });
    if (!merchant) throw new AccessError('MERCHANT_NOT_FOUND', 404);
    // 승인 전 가맹점에 계정을 붙이면 승인 절차를 건너뛰는 셈이 된다
    if (merchant.status !== 'APPROVED') throw new AccessError('MERCHANT_NOT_APPROVED', 409);
  }

  const after = await prisma.user.update({
    where: { id: userId },
    data: { role: input.role, merchantId: input.merchantId },
    select: { id: true, name: true, email: true, role: true, merchantId: true },
  });

  return {
    before: { role: target.role, merchantId: target.merchantId },
    after,
  };
}
