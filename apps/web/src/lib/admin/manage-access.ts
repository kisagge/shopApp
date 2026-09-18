import 'server-only';
import { prisma } from '@shop/db';
import {
  assertPermission, canAssignRole, canEditUser, canSuspendUser, canMoveMerchantTo,
  type Actor, type UserRole,
} from '@shop/core';
import { activateApprovedMerchant } from '~/lib/merchant/apply';
import { notifyMerchantDecision } from '~/lib/notifications/merchant-decision';
import {
  ADMIN_ERROR_MESSAGE,
  type AdminErrorCode,
  type AssignRoleInput,
  type SuspendUserInput,
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
   * **갈 수 있는 곳인가.** 장사하던 가맹점을 "반려" 하면 나중에 읽는 사람이 이
   * 가맹점이 들어온 적이 있는지 없는지 가릴 수 없고, 끝난 줄(해지·반려)을
   * 되살리면 그때의 판단이 지워진다. 화면도 안 보여 주지만 화면만 믿지 않는다.
   */
  if (before.status !== input.status && !canMoveMerchantTo(before.status, input.status)) {
    throw new AccessError('MERCHANT_STATUS_NOT_ALLOWED', 409);
  }

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
      /*
       * **반려 사유는 행에 남긴다.** 알림에는 한 줄에 들어갈 만큼만 줄여 싣고,
       * 전문은 신청 화면이 보여 준다 — 무엇을 고쳐 다시 낼지 알아야 한다.
       * 반려가 아닌 처분에서는 지운다: 지난 반려의 이유가 정상 가맹점 화면에
       * 남아 있으면 지금 상태를 잘못 읽는다.
       */
      data: {
        status: input.status,
        rejectionReason: input.status === 'REJECTED' ? input.reason : null,
        /*
         * **정지·해지의 사유도 행에 남긴다.** 받아 두고 감사 로그에만 남겨서, 정작 멈춘 가게는 콘솔이 닫힌
         * 것만 보았다. 반려와 칸을 나눈다 — 신청 화면이 지난 정지 사유를 반려 사유로 읽으면 안 된다.
         * 다시 승인하면 지운다: 지난 정지의 이유가 멀쩡한 가맹점 화면에 남아 있으면 지금 상태를 잘못 읽는다.
         */
        suspendedReason:
          input.status === 'SUSPENDED' || input.status === 'TERMINATED' ? input.reason : null,
      },
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

  /*
   * **결과를 신청한 사람에게 알린다.** 승인은 계정과 브랜드까지 만들어 주면서
   * 아무 말도 안 했고, 반려 사유는 감사 로그에만 남아 신청자에게 닿지 않았다.
   * 트랜잭션 밖이고 스스로 실패를 삼킨다 — 알림이 안 갔다고 처분을 무를 일이 아니다.
   */
  await notifyMerchantDecision({
    merchantId,
    merchantName: after.name,
    status: after.status,
    reason: input.reason,
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

export interface SuspensionSnapshot {
  readonly suspendedAt: Date | null;
  readonly suspendedReason: string | null;
}

/**
 * 회원 이용 정지·해제.
 *
 * **정지하면 그 자리에서 로그인 수단을 끊는다.** 상태만 적으면 이미 로그인해 둔 사람은 세션이 끝날 때까지
 * (30일) 그대로 쓴다. 세션을 지우고, 새로 로그인하려는 순간은 로그인 훅이 막는다(@shop/auth). 탈퇴와 같은
 * 끊기지만 비밀번호·구글 연결(Account)은 남긴다 — 해제하면 같은 비밀번호로 돌아와야 한다.
 *
 * 남는 틈 하나: 세션 쿠키 캐시(5분)는 DB 를 안 보고 통과시킨다. 그래서 **돈이 오가는 주문 창구는 정지를
 * DB 에서 다시 본다**(getQuoteViewer). 후기·문의 같은 쓰기는 캐시가 끝나는 몇 분 안에 막힌다.
 */
export async function suspendUser(
  actor: Actor,
  userId: string,
  input: SuspendUserInput,
  now: Date = new Date(),
): Promise<{ before: SuspensionSnapshot; after: SuspensionSnapshot }> {
  assertPermission(actor, 'user:write');

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, deletedAt: true, suspendedAt: true, suspendedReason: true },
  });
  if (!target) throw new AccessError('USER_NOT_FOUND', 404);
  // 탈퇴한 계정은 이미 들어올 길이 없다. 정지를 걸면 되살아날 때 이유 모를 잠금이 붙는다
  if (target.deletedAt !== null) throw new AccessError('USER_CLOSED', 409);

  const verdict = canSuspendUser(actor, target);
  if (verdict === 'SELF') throw new AccessError('CANNOT_SUSPEND_SELF', 403);
  if (verdict === 'STAFF') throw new AccessError('CANNOT_SUSPEND_STAFF', 403);
  if (verdict === 'FORBIDDEN') throw new AccessError('CANNOT_EDIT_SUPER_ADMIN', 403);

  const before = { suspendedAt: target.suspendedAt, suspendedReason: target.suspendedReason };

  if (input.action === 'SUSPEND') {
    if (target.suspendedAt !== null) throw new AccessError('ALREADY_SUSPENDED', 409);
    await prisma.$transaction(async (tx) => {
      // 읽은 상태를 조건에 싣는다 — 그 사이 역할이 바뀌었으면(관리자로 올라갔으면) 위 판단이 무의미하다
      const { count } = await tx.user.updateMany({
        where: { id: userId, role: target.role, suspendedAt: null, deletedAt: null },
        data: { suspendedAt: now, suspendedReason: input.reason, suspendedBy: actor.id },
      });
      if (count === 0) throw new AccessError('CHANGED_MEANWHILE', 409);
      await tx.session.deleteMany({ where: { userId } });
    });
    return { before, after: { suspendedAt: now, suspendedReason: input.reason } };
  }

  if (target.suspendedAt === null) throw new AccessError('NOT_SUSPENDED', 409);
  const { count } = await prisma.user.updateMany({
    where: { id: userId, role: target.role, suspendedAt: { not: null }, deletedAt: null },
    data: { suspendedAt: null, suspendedReason: null, suspendedBy: null },
  });
  if (count === 0) throw new AccessError('CHANGED_MEANWHILE', 409);
  return { before, after: { suspendedAt: null, suspendedReason: null } };
}
