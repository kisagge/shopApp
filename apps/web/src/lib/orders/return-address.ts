import 'server-only';
import { prisma } from '@shop/db';
import {
  canEditReturnAddress, ForbiddenError, normalizeReturnAddress, PLATFORM_RETURN_ADDRESS_ID, returnDestinations,
  showsReturnAddress,
  type Actor, type Permission, type ReturnAddress, type ReturnDestination,
} from '@shop/core';
import type { ReturnAddressInput } from '@shop/contract';

const ADDRESS_SELECT = {
  merchantId: true, recipient: true, phone: true, postalCode: true, address1: true, address2: true,
} as const;

type Row = { merchantId: string | null } & ReturnAddress;

const toAddress = (r: Row): ReturnAddress => ({
  recipient: r.recipient, phone: r.phone, postalCode: r.postalCode, address1: r.address1, address2: r.address2,
});

/** 한 판매처의 반품지. `merchantId` 가 null 이면 플랫폼 반품지 */
export async function getReturnAddress(merchantId: string | null): Promise<ReturnAddress | null> {
  const row = await prisma.returnAddress.findUnique({
    where: merchantId === null ? { id: PLATFORM_RETURN_ADDRESS_ID } : { merchantId },
    select: ADDRESS_SELECT,
  });
  return row ? toAddress(row) : null;
}

/** 반품지 화면 — 가맹점 이름과 그 반품지. 없는 가맹점이면 null */
export async function getMerchantReturnAddress(
  merchantId: string,
): Promise<{ name: string; address: ReturnAddress | null } | null> {
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { name: true, returnAddress: { select: ADDRESS_SELECT } },
  });
  if (!merchant) return null;
  return { name: merchant.name, address: merchant.returnAddress ? toAddress(merchant.returnAddress) : null };
}

/**
 * 줄들을 판매처별로 묶고 반품지를 붙인다 — 한 번에 읽는다(판매처마다 읽지 않게).
 */
export async function destinationsFor(
  lines: readonly { readonly id: string; readonly merchantId: string | null }[],
): Promise<ReturnDestination[]> {
  if (lines.length === 0) return [];
  const merchantIds = [...new Set(lines.map((l) => l.merchantId).filter((id): id is string => id !== null))];
  const needsPlatform = lines.some((l) => l.merchantId === null);
  const rows = await prisma.returnAddress.findMany({
    where: {
      OR: [
        ...(merchantIds.length ? [{ merchantId: { in: merchantIds } }] : []),
        ...(needsPlatform ? [{ id: PLATFORM_RETURN_ADDRESS_ID }] : []),
      ],
    },
    select: ADDRESS_SELECT,
  });
  const byMerchant = new Map(rows.map((r) => [r.merchantId, toAddress(r)]));
  return returnDestinations(lines, (id) => byMerchant.get(id) ?? null);
}

/**
 * 손님 주문 화면이 쓰는 보낼 곳 — 승인했고 아직 안 왔을 때만(core showsReturnAddress), 신청한 줄만.
 *
 * 줄을 고르지 않은 옛 신청은 반품접수인 줄 전부가 신청한 줄이다 — 처리 쪽(loadForResolve)과 같은 규칙이다.
 */
export async function approvedReturnDestinations(
  items: readonly { readonly id: string; readonly status: string; readonly canceledAt: Date | null; readonly merchantId: string | null }[],
  request: { readonly status: string; readonly receivedAt: Date | null; readonly itemIds: readonly string[] },
): Promise<ReturnDestination[]> {
  if (!showsReturnAddress(request)) return [];
  const lines = items.filter((i) =>
    request.itemIds.length > 0 ? request.itemIds.includes(i.id) : i.status === 'RETURN_REQUESTED' && i.canceledAt === null);
  return await destinationsFor(lines);
}

export class ReturnAddressError extends Error {
  constructor(readonly code: 'MERCHANT_NOT_FOUND', message: string, readonly status = 404) {
    super(message);
    this.name = 'ReturnAddressError';
  }
}

/**
 * 반품지를 등록하거나 고친다. 전후 값을 돌려준다 — 감사 로그는 라우트가 남긴다(배송비 정책과 같은 나눔).
 *
 * **한 판매처에 한 줄이라 upsert 로 쓴다.** "있는지 보고 쓴다" 로 하면 두 사람이 처음 등록할 때 하나가 유니크 제약에 걸린다.
 */
export async function updateReturnAddress(
  actor: Actor,
  merchantId: string | null,
  input: ReturnAddressInput,
): Promise<{ before: ReturnAddress | null; after: ReturnAddress }> {
  if (!canEditReturnAddress(actor, merchantId)) {
    const permission: Permission = merchantId === null ? 'shipping:write' : 'merchant:write';
    throw new ForbiddenError(actor, permission);
  }
  if (merchantId !== null) {
    const merchant = await prisma.merchant.findUnique({ where: { id: merchantId }, select: { id: true } });
    if (!merchant) throw new ReturnAddressError('MERCHANT_NOT_FOUND', '가맹점을 찾을 수 없습니다.');
  }

  const data = { ...normalizeReturnAddress(input), updatedById: actor.id };
  const before = await getReturnAddress(merchantId);
  const row = merchantId === null
    ? await prisma.returnAddress.upsert({
        where: { id: PLATFORM_RETURN_ADDRESS_ID },
        update: data,
        create: { id: PLATFORM_RETURN_ADDRESS_ID, ...data },
        select: ADDRESS_SELECT,
      })
    : await prisma.returnAddress.upsert({
        where: { merchantId },
        update: data,
        create: { merchantId, ...data },
        select: ADDRESS_SELECT,
      });
  return { before, after: toAddress(row) };
}
