import 'server-only';
import { prisma } from '@shop/db';
import {
  canApplyAsMerchant, brandSlugOf, OPEN_MERCHANT_STATUS,
  type MerchantStatus,
  MERCHANT_APPLICATION_ERROR,
  type Actor, type MerchantApplicationErrorCode,
} from '@shop/core';
import type { ApplyMerchantInput } from '@shop/contract';

export class MerchantApplicationError extends Error {
  constructor(readonly code: MerchantApplicationErrorCode, readonly status = 409) {
    super(MERCHANT_APPLICATION_ERROR[code]);
    this.name = 'MerchantApplicationError';
  }
}

export interface ApplicationView {
  readonly id: string;
  readonly name: string;
  readonly brandName: string | null;
  /*
   * **좁혀서 내보낸다.** 예전에는 `string` 이라 화면이 쓸 때마다 캐스팅했고,
   * 그 캐스팅이 있는 한 상태가 하나 늘어도 타입이 아무 말을 안 한다.
   * Prisma 의 enum 과 core 의 목록이 같은 것을 가리키므로 여기서 못 박는다.
   */
  readonly status: MerchantStatus;
  readonly createdAt: Date;
  readonly approvedAt: Date | null;
  /** 반려 사유. 반려가 아니면 null — 지난 반려의 이유가 남아 있으면 지금 상태를 잘못 읽는다 */
  readonly rejectionReason: string | null;
}

/** 내가 낸 신청. 없으면 null. */
export async function getMyApplication(userId: string): Promise<ApplicationView | null> {
  return prisma.merchant.findFirst({
    where: { applicantId: userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, name: true, brandName: true, status: true,
      createdAt: true, approvedAt: true, rejectionReason: true,
    },
  });
}

/**
 * 입점 신청.
 *
 * **심사 중에는 아무 권한도 주지 않는다.** applicantId 만 남기고 users 에는
 * 넣지 않는다 — 넣는 순간 승인 전인 사람에게 가맹점 범위가 생긴다.
 */
export async function applyForMerchant(
  actor: Actor,
  input: ApplyMerchantInput,
): Promise<ApplicationView> {
  if (actor.merchantId !== null) throw new MerchantApplicationError('ALREADY_MERCHANT', 409);
  if (!canApplyAsMerchant(actor.role)) throw new MerchantApplicationError('NOT_APPLICABLE', 403);

  /*
   * 이미 낸 신청이 있으면 막는다.
   *
   * 해지(TERMINATED)된 경우는 다시 낼 수 있어야 한다 — 고쳐서 다시 오는
   * 길을 막으면 반려가 곧 영구 거절이 된다.
   */
  const existing = await prisma.merchant.findFirst({
    where: { applicantId: actor.id, status: { in: [...OPEN_MERCHANT_STATUS] } },
    select: { id: true },
  });
  if (existing) throw new MerchantApplicationError('ALREADY_APPLIED', 409);

  // 유니크 제약이 DB 에서도 막지만, 무엇이 겹쳤는지는 여기서만 말해 줄 수 있다
  const [nameTaken, numberTaken, brandTaken] = await Promise.all([
    prisma.merchant.findUnique({ where: { name: input.name }, select: { id: true } }),
    prisma.merchant.findUnique({
      where: { businessNumber: input.businessNumber },
      select: { id: true },
    }),
    prisma.brand.findUnique({ where: { name: input.brandName }, select: { id: true } }),
  ]);
  if (nameTaken) throw new MerchantApplicationError('NAME_TAKEN', 409);
  if (numberTaken) throw new MerchantApplicationError('BUSINESS_NUMBER_TAKEN', 409);
  if (brandTaken) throw new MerchantApplicationError('BRAND_NAME_TAKEN', 409);

  return prisma.merchant.create({
    data: {
      name: input.name,
      brandName: input.brandName,
      businessName: input.businessName,
      businessNumber: input.businessNumber,
      representative: input.representative,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      applicantId: actor.id,
      // 기본값이지만 명시한다 — 신청은 언제나 심사 대기로 시작한다
      status: 'PENDING',
    },
    select: {
      id: true, name: true, brandName: true, status: true,
      createdAt: true, approvedAt: true, rejectionReason: true,
    },
  });
}

/**
 * 승인할 때 계정과 브랜드를 함께 만든다.
 *
 * **여기까지 해야 앞부분이 이어진다.** 상태만 APPROVED 로 바꾸면 승인된
 * 가맹점이 로그인해도 아무것도 할 수 없고, 결국 운영진이 계정과 브랜드를
 * 손으로 만들어 줘야 한다 — 신청 입구를 만든 뜻이 없어진다.
 *
 * 한 트랜잭션에서 돈다. 중간에 끊겨 브랜드만 생기면 주인 없는 브랜드가 남는다.
 */
export async function activateApprovedMerchant(merchantId: string): Promise<void> {
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: {
      id: true, name: true, brandName: true, applicantId: true,
      _count: { select: { brands: true } },
    },
  });
  // 운영진이 직접 만든 가맹점은 신청자가 없다. 그때는 할 일이 없다.
  if (!merchant?.applicantId) return;

  const applicant = await prisma.user.findFirst({
    where: { id: merchant.applicantId, deletedAt: null },
    select: { id: true, role: true, merchantId: true },
  });
  if (!applicant) throw new MerchantApplicationError('APPLICANT_GONE', 409);

  await prisma.$transaction(async (tx) => {
    // 이미 붙어 있으면 다시 붙이지 않는다 — 승인을 두 번 눌러도 같아야 한다
    if (applicant.merchantId !== merchant.id) {
      await tx.user.update({
        where: { id: applicant.id },
        data: { role: 'MERCHANT', merchantId: merchant.id },
      });
    }

    /*
     * 브랜드가 하나도 없을 때만 만든다. 승인을 다시 눌렀다고 같은 브랜드가
     * 또 생기면 안 된다.
     */
    if (merchant._count.brands === 0 && merchant.brandName) {
      const base = brandSlugOf(merchant.brandName);
      /*
       * 한글 이름이면 라틴 문자가 남지 않아 슬러그가 빈다. 그때는 가맹점
       * id 를 쓴다 — 사람이 읽기 좋지는 않아도 주소가 겹치지 않고, 나중에
       * 가맹점이 직접 고칠 수 있다.
       */
      const slug = base.length > 0 ? base : `brand-${merchant.id.slice(-8)}`;

      await tx.brand.create({
        data: { name: merchant.brandName, slug, merchantId: merchant.id },
      });
    }
  });
}
