import 'server-only';
import { prisma } from '@shop/db';
import { assertPermission, canAssignRole, canEditUser, type Actor, type UserRole } from '@shop/core';
import { activateApprovedMerchant } from '~/lib/merchant/apply';
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

  /*
   * **최초 승인일은 비어 있을 때만 찍는다 — 쓰는 순간에 확인한다.**
   *
   * 읽어 온 approvedAt 으로 판단하면, 두 사람이 동시에 승인할 때 둘 다
   * "아직 비어 있다" 로 보고 각자 지금 시각을 찍는다. 뒤엣것이 이기면
   * 최초 입점일이 뒤로 밀리고, 그 날짜는 **정산 기간 계산의 기준**이다.
   *
   * where 에 조건을 실으면 이미 찍힌 뒤에는 0건이 되고, 그게 맞다.
   */
  const after = await prisma.$transaction(async (tx) => {
    if (input.status === 'APPROVED') {
      await tx.merchant.updateMany({
        where: { id: merchantId, approvedAt: null },
        data: { approvedAt: new Date() },
      });
    }
    return tx.merchant.update({
      where: { id: merchantId },
      data: { status: input.status },
      select: { id: true, name: true, status: true, approvedAt: true },
    });
  });

  /*
   * 승인하면 신청자의 계정과 브랜드를 함께 만든다.
   *
   * 상태만 바꾸면 승인된 가맹점이 로그인해도 아무것도 할 수 없고, 결국
   * 운영진이 계정과 브랜드를 손으로 만들어 줘야 한다 — 신청 입구를 만든
   * 뜻이 없어진다. 운영진이 직접 만든 가맹점(신청자 없음)은 그냥 지나간다.
   */
  if (input.status === 'APPROVED') {
    await activateApprovedMerchant(merchantId);
  }

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
    select: { id: true, name: true, email: true, role: true, merchantId: true, deletedAt: true },
  });
  if (!target) throw new AccessError('USER_NOT_FOUND', 404);

  /*
   * 탈퇴한 계정에는 권한을 주지 않는다.
   *
   * 행이 남아 있어서 목록에도 보이고 id 도 그대로다. 막지 않으면 들어올
   * 길이 없는 계정에 운영 권한이 붙고, 나중에 그 계정이 되살아나면 그
   * 권한을 그대로 들고 들어온다.
   */
  if (target.deletedAt !== null) throw new AccessError('USER_CLOSED', 409);

  if (!canAssignRole(actor, target, input.role)) {
    throw new AccessError('CANNOT_CHANGE_OWN_ROLE', 403);
  }
  if (!canEditUser(actor, { id: target.id, role: target.role })) {
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

  /*
   * **읽은 상태를 그대로 조건에 싣는다.**
   *
   * 위 검사들은 전부 `target` 을 읽은 시점의 값으로 판단한다. 읽기와 쓰기
   * 사이에 대상이 바뀌면 그 판단이 무의미해진다 — 가장 나쁜 경우는 그 사이에
   * 대상이 슈퍼관리자가 되는 것이다. canEditUser 가 막으려던 바로 그 일이
   * 검사를 지나쳐 벌어진다.
   *
   * 재고를 깎을 때 `stock: { gte: quantity }` 를 거는 것과 같은 방식이다.
   * 안 맞으면 0건이고, 0건은 실패다.
   */
  const changed = await prisma.user.updateMany({
    where: { id: userId, role: target.role, merchantId: target.merchantId, deletedAt: null },
    data: { role: input.role, merchantId: input.merchantId },
  });
  if (changed.count === 0) throw new AccessError('CHANGED_MEANWHILE', 409);

  const after = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, merchantId: true },
  });

  return {
    before: { role: target.role, merchantId: target.merchantId },
    after,
  };
}
