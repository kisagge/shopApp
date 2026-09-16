import 'server-only';
import { prisma } from '@shop/db';
import {
  canEditBusinessInfo, canEditMerchantSettings, ForbiddenError, maskAccount,
  type Actor,
} from '@shop/core';
import type { MerchantBusinessInput, MerchantSettingsInput } from '@shop/contract';

/**
 * 가맹점 정보와 정산 계좌.
 *
 * **두 갈래로 나눠 둔다.** 연락처와 계좌는 가맹점이 자기 것을 고치고, 상호·사업자등록번호·대표자는 운영진만 고친다 —
 * 정산과 세금계산서가 그 값을 근거로 삼으므로, 스스로 바꿀 수 있으면 돈 받는 주체가 심사 없이 바뀐다.
 */

export class MerchantSettingsError extends Error {
  constructor(readonly code: string, readonly status = 400, message = '가맹점을 찾을 수 없습니다.') {
    super(message);
    this.name = 'MerchantSettingsError';
  }
}

export interface MerchantSettingsRow {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly businessName: string;
  readonly businessNumber: string;
  readonly representative: string;
  readonly contactEmail: string;
  readonly contactPhone: string;
  readonly commissionPercent: number;
  readonly settlementBank: string | null;
  readonly settlementAccount: string | null;
  readonly settlementHolder: string | null;
}

export async function getMerchantSettings(actor: Actor, merchantId: string): Promise<MerchantSettingsRow> {
  if (!canEditMerchantSettings(actor, merchantId)) {
    throw new ForbiddenError(actor, 'merchant:write');
  }

  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: {
      id: true, name: true, status: true,
      businessName: true, businessNumber: true, representative: true,
      contactEmail: true, contactPhone: true, commissionPercent: true,
      settlementBank: true, settlementAccount: true, settlementHolder: true,
    },
  });
  if (!merchant) throw new MerchantSettingsError('NOT_FOUND', 404);

  return merchant;
}

/** 감사 로그에 남길 모양. **계좌번호는 가려서 남긴다** — 무엇이 바뀌었는지는 뒤 네 자리로도 안다 */
function auditable(row: {
  contactEmail: string; contactPhone: string;
  settlementBank: string | null; settlementAccount: string | null; settlementHolder: string | null;
}) {
  return {
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    settlementBank: row.settlementBank,
    accountTail: maskAccount(row.settlementAccount),
    settlementHolder: row.settlementHolder,
  };
}

export async function updateMerchantSettings(
  actor: Actor,
  merchantId: string,
  input: MerchantSettingsInput,
): Promise<{ before: ReturnType<typeof auditable>; after: ReturnType<typeof auditable> }> {
  const before = await getMerchantSettings(actor, merchantId);

  const after = await prisma.merchant.update({
    where: { id: merchantId },
    data: {
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      settlementBank: input.settlementBank,
      settlementAccount: input.settlementAccount,
      settlementHolder: input.settlementHolder,
    },
    select: {
      contactEmail: true, contactPhone: true,
      settlementBank: true, settlementAccount: true, settlementHolder: true,
    },
  });

  return { before: auditable(before), after: auditable(after) };
}

export async function updateMerchantBusiness(
  actor: Actor,
  merchantId: string,
  input: MerchantBusinessInput,
): Promise<{ before: MerchantBusinessInput; after: MerchantBusinessInput }> {
  if (!canEditBusinessInfo(actor)) {
    throw new ForbiddenError(actor, 'merchant:write');
  }

  const before = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { name: true, businessName: true, businessNumber: true, representative: true },
  });
  if (!before) throw new MerchantSettingsError('NOT_FOUND', 404);

  try {
    const after = await prisma.merchant.update({
      where: { id: merchantId },
      data: input,
      select: { name: true, businessName: true, businessNumber: true, representative: true },
    });
    return { before, after };
  } catch (error) {
    /*
     * 이름과 사업자등록번호는 유니크다. 같은 값이 이미 있으면 그렇게 말한다 —
     * "저장하지 못했습니다" 만 돌려주면 무엇을 고쳐야 할지 알 수 없다.
     */
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
      throw new MerchantSettingsError('DUPLICATE', 409, '같은 이름이나 사업자등록번호가 이미 있습니다.');
    }
    throw error;
  }
}
