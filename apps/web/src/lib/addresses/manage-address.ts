import 'server-only';
import { prisma } from '@shop/db';
import { isRemoteAreaPostalCode, normalizePhone, MAX_ADDRESSES } from '@shop/core';
import type { AddressInput } from '@shop/contract';

/**
 * 배송지 관리.
 *
 * 두 가지를 서버가 정한다.
 * 1. **도서산간 여부** — 추가 배송비가 걸린 값이라 사용자가 고르게 두면
 *    제주에 사는 사람이 체크를 풀고 3,000원을 아낀다. 우편번호에서 판정한다.
 * 2. **기본 배송지** — 첫 배송지는 무조건 기본이다. 기본이 하나도 없으면
 *    주문 화면이 "배송지 없음" 으로 보이는데, 방금 등록한 사람에게는
 *    말이 안 되는 상태다.
 */

export interface SavedAddress {
  readonly id: string;
  readonly label: string | null;
  readonly recipient: string;
  readonly phone: string;
  readonly postalCode: string;
  readonly address1: string;
  readonly address2: string | null;
  readonly isRemoteArea: boolean;
  readonly isDefault: boolean;
}

export class AddressError extends Error {
  constructor(readonly code: 'TOO_MANY' | 'NOT_FOUND', readonly status: number) {
    super(
      code === 'TOO_MANY'
        ? `배송지는 ${MAX_ADDRESSES}개까지 저장할 수 있습니다`
        : '배송지를 찾을 수 없습니다',
    );
    this.name = 'AddressError';
  }
}

const SELECT = {
  id: true, label: true, recipient: true, phone: true,
  postalCode: true, address1: true, address2: true,
  isRemoteArea: true, isDefault: true,
} as const;

export function listAddresses(userId: string): Promise<SavedAddress[]> {
  return prisma.address.findMany({
    where: { userId },
    // 기본 배송지가 맨 위. 그다음은 최근에 넣은 것부터.
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    select: SELECT,
  });
}

export async function createAddress(userId: string, input: AddressInput): Promise<SavedAddress> {
  const count = await prisma.address.count({ where: { userId } });
  if (count >= MAX_ADDRESSES) throw new AddressError('TOO_MANY', 409);

  // 첫 배송지는 반드시 기본이다. 요청이 무엇이라고 했든.
  const makeDefault = input.isDefault || count === 0;

  return prisma.$transaction(async (tx) => {
    if (makeDefault) {
      // 기본은 하나뿐이다. 둘이 되면 주문 화면이 어느 쪽을 쓸지 알 수 없다.
      await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
    }
    return tx.address.create({
      data: {
        userId,
        label: input.label?.trim() || null,
        recipient: input.recipient,
        phone: normalizePhone(input.phone),
        postalCode: input.postalCode,
        address1: input.address1,
        address2: input.address2?.trim() || null,
        // 우편번호에서 정한다. 요청에는 이 값이 아예 없다.
        isRemoteArea: isRemoteAreaPostalCode(input.postalCode),
        isDefault: makeDefault,
      },
      select: SELECT,
    });
  });
}

/**
 * 배송지를 고친다.
 *
 * 받는 분·번호·주소 오타 하나에 지우고 다시 넣게 하면, 기본 배송지였던 것이 지워지며 다른 주소가 기본으로 올라가고 새로
 * 넣은 것은 맨 위로 간다 — 고치려던 한 칸 말고 두 가지가 더 바뀐다.
 *
 * - **도서산간은 다시 판정한다.** 우편번호를 고쳤으면 추가 배송비도 따라 바뀌어야 한다(만들 때와 같은 이유).
 * - **기본 여부는 여기서 바꾸지 않는다.** 고치는 폼이 기본을 내리게 두면 기본이 하나도 없는 상태가 된다. 올리는 것은
 *   "기본으로" 단추(setDefaultAddress)가 한다.
 * - **이미 한 주문의 배송지는 바뀌지 않는다.** 주문은 배송지를 복사해 들고 있다 — 보낸 뒤에 주소록을 고쳤다고 송장의 주소가
 *   바뀌면 안 된다.
 */
export async function updateAddress(userId: string, addressId: string, input: AddressInput): Promise<SavedAddress> {
  // 남의 배송지를 고칠 수 없다. userId 를 조건에 함께 건다
  const { count } = await prisma.address.updateMany({
    where: { id: addressId, userId },
    data: {
      label: input.label?.trim() || null,
      recipient: input.recipient,
      phone: normalizePhone(input.phone),
      postalCode: input.postalCode,
      address1: input.address1,
      address2: input.address2?.trim() || null,
      isRemoteArea: isRemoteAreaPostalCode(input.postalCode),
    },
  });
  if (count === 0) throw new AddressError('NOT_FOUND', 404);
  return prisma.address.findUniqueOrThrow({ where: { id: addressId }, select: SELECT });
}

export async function setDefaultAddress(userId: string, addressId: string): Promise<void> {
  // 남의 배송지를 기본으로 만들 수 없다. userId 를 함께 건다.
  const target = await prisma.address.findFirst({
    where: { id: addressId, userId },
    select: { id: true },
  });
  if (!target) throw new AddressError('NOT_FOUND', 404);

  await prisma.$transaction([
    prisma.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } }),
    prisma.address.update({ where: { id: addressId }, data: { isDefault: true } }),
  ]);
}

/**
 * 배송지를 지운다.
 *
 * 지운 것이 기본이었으면 남은 것 중 하나를 기본으로 올린다. 안 그러면
 * 배송지가 있는데도 주문 화면이 "등록된 배송지가 없습니다" 를 띄운다.
 */
export async function deleteAddress(userId: string, addressId: string): Promise<void> {
  const target = await prisma.address.findFirst({
    where: { id: addressId, userId },
    select: { id: true, isDefault: true },
  });
  if (!target) throw new AddressError('NOT_FOUND', 404);

  await prisma.$transaction(async (tx) => {
    await tx.address.delete({ where: { id: addressId } });
    if (!target.isDefault) return;

    const next = await tx.address.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
  });
}
