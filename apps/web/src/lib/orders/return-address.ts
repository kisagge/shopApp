import 'server-only';
import { prisma } from '@shop/db';
import {
  canEditReturnAddress, ForbiddenError, linesOfRequest, missingReturnAddresses,
  normalizeReturnAddress, PLATFORM_RETURN_ADDRESS_ID, returnAddressChanged, returnDestinations,
  showsReturnAddress,
  type Actor, type Permission, type ReturnAddress, type ReturnDestination,
} from '@shop/core';
import type { ReturnAddressInput } from '@shop/contract';
import { clearReturnAddressMissing, notifyReturnAddressChanged } from '~/lib/notifications/console-work';
import { onDisplay } from '~/lib/queries/catalog/shelf';

const ADDRESS_SELECT = {
  merchantId: true, recipient: true, phone: true, postalCode: true, address1: true, address2: true,
} as const;

/** 보낼 곳을 그릴 때는 **언제 고쳤는지**까지 읽는다 — 승인 뒤에 바뀐 주소를 짚어 주려면 그 시각이 필요하다 */
const DESTINATION_SELECT = { ...ADDRESS_SELECT, updatedAt: true } as const;

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

/**
 * **돌려받을 곳이 있는 판매처만** 골라 준다 — 한 번에 묻는다(판매처마다 읽지 않게).
 *
 * 상품을 매대에 올릴 수 있는지 묻는 자리가 쓴다. `null` 은 자사 상품(플랫폼 반품지)이다.
 */
export async function ownersWithReturnAddress(
  owners: readonly (string | null)[],
): Promise<Set<string | null>> {
  const merchantIds = [...new Set(owners.filter((o): o is string => o !== null))];
  const needsPlatform = owners.includes(null);
  if (merchantIds.length === 0 && !needsPlatform) return new Set();

  const rows = await prisma.returnAddress.findMany({
    where: {
      OR: [
        ...(merchantIds.length ? [{ merchantId: { in: merchantIds } }] : []),
        ...(needsPlatform ? [{ id: PLATFORM_RETURN_ADDRESS_ID }] : []),
      ],
    },
    select: { merchantId: true },
  });
  return new Set(rows.map((r) => r.merchantId));
}

/**
 * **반품지 없이 팔고 있는 판매처의 수.**
 *
 * 이제 반품지가 없으면 매대에 올릴 수 없지만(assertReturnAddress), 그 문이 생기기 전에 올라간 상품은
 * 그대로 서 있다. 그것을 볼 자리가 어디에도 없었다 — 가맹점 목록에 "미등록" 뱃지는 붙지만 그 가게가
 * **지금 팔고 있는지**는 말해 주지 않고, 팔지 않는 가맹점의 미등록은 급한 일이 아니다.
 *
 * **판매처를 센다.** 반품지 한 줄이 그 가게의 상품 전부를 구하므로, 상품 200개를 세어 봐야 할 일은
 * 하나다. 자사 상품도 한 판매처로 센다(플랫폼 반품지도 한 줄이다).
 *
 * **매대의 조건은 스토어프론트와 같은 것을 쓴다**(onDisplay) — 따로 적으면 손님에게는 보이는데 이
 * 숫자에는 없는 상품이 생긴다.
 */
export async function sellersMissingReturnAddress(scope: string | null): Promise<number> {
  const merchants = await prisma.merchant.count({
    where: {
      // 정지·해지된 가맹점의 상품은 매대에서 내려간다(sellableBrand) — 지금 파는 곳만 센다
      ...(scope === null ? { status: 'APPROVED' as const } : { id: scope }),
      returnAddress: { is: null },
      brands: { some: { products: { some: onDisplay() } } },
    },
  });
  // 가맹점은 자사 반품지와 상관이 없다 — 자기 가게 하나다
  if (scope !== null) return merchants;

  const platform = await prisma.returnAddress.findUnique({
    where: { id: PLATFORM_RETURN_ADDRESS_ID },
    select: { id: true },
  });
  if (platform) return merchants;

  const own = await prisma.product.count({ where: { ...onDisplay(), brand: { merchantId: null } } });
  return merchants + (own > 0 ? 1 : 0);
}

/**
 * 이 가맹점이 **아직 못 하는 일** — 등록하지 않아 막혀 있는 것.
 *
 * 둘 다 "없으면 막는다" 는 자리다: 반품지가 없으면 상품을 매대에 올릴 수 없고(assertReturnAddress),
 * 정산 계좌가 없으면 지급을 할 수 없다. 운영진은 가맹점 목록에서 남의 빈칸을 보지만(미등록 뱃지),
 * **정작 그 가맹점 자신에게는 말해 주는 자리가 없었다** — 승인받고 들어와 상품을 올리려다 막히고
 * 나서야 알았다. 막는 쪽을 만들었으면 들어오는 길에 말해 주는 쪽도 있어야 한다.
 */
export async function merchantSetupTodo(
  merchantId: string,
): Promise<{ returnAddress: boolean; settlementAccount: boolean }> {
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { settlementAccount: true, returnAddress: { select: { id: true } } },
  });
  // 없는 가맹점이면 할 말도 없다 — 조회가 비면 화면은 아무 줄도 세우지 않는다
  if (!merchant) return { returnAddress: false, settlementAccount: false };

  return {
    returnAddress: merchant.returnAddress === null,
    settlementAccount: merchant.settlementAccount === null,
  };
}

/** 이 판매처에 돌려받을 곳이 있는가. `merchantId` 가 null 이면 자사 상품(플랫폼 반품지) */
export async function hasReturnAddress(merchantId: string | null): Promise<boolean> {
  return (await ownersWithReturnAddress([merchantId])).has(merchantId);
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
  /** 승인한 시각. 그 뒤에 고친 주소는 손님이 상자에 적어 둔 것과 다르다 */
  approvedAt?: Date | null,
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
    select: DESTINATION_SELECT,
  });
  const byMerchant = new Map(
    rows.map((r) => [r.merchantId, { address: toAddress(r), updatedAt: r.updatedAt }]),
  );
  return returnDestinations(lines, (id) => byMerchant.get(id) ?? null, approvedAt);
}

/**
 * 손님 주문 화면이 쓰는 보낼 곳 — 승인했고 아직 안 왔을 때만(core showsReturnAddress), 신청한 줄만.
 *
 * 줄을 고르지 않은 옛 신청은 반품접수인 줄 전부가 신청한 줄이다 — 처리 쪽(loadForResolve)과 같은 규칙이다.
 */
export async function approvedReturnDestinations(
  items: readonly { readonly id: string; readonly status: string; readonly canceledAt: Date | null; readonly merchantId: string | null }[],
  request: {
    readonly status: string;
    readonly receivedAt: Date | null;
    readonly itemIds: readonly string[];
    /** 승인한 시각 — 그 뒤에 반품지가 바뀌었는지 짚어 주려면 필요하다 */
    readonly resolvedAt?: Date | null;
  },
): Promise<ReturnDestination[]> {
  if (!showsReturnAddress(request)) return [];
  return await destinationsFor(linesOfRequest(items, request), request.resolvedAt ?? null);
}

/**
 * 이 신청에서 **보낼 곳이 없는** 판매처.
 *
 * **승인을 누르려다 막히고 나서야 드러났다.** 누를 생각을 안 하면 영영 드러나지 않고, 그사이 손님의
 * 신청은 대기열에 갇혀 있다 — 손님 화면에는 "승인을 기다리는 중" 만 뜬다. 신청이 들어온 그 자리에서
 * 등록할 사람에게 알리려고 미리 짚는다.
 *
 * 승인 때 막는 것과 같은 함수를 쓴다(core missingReturnAddresses) — 두 곳이 갈리면 "알림은 왔는데
 * 승인은 되는" 또는 그 반대가 된다.
 */
export async function ownersMissingReturnAddress(
  orderNo: string,
  itemIds: readonly string[],
): Promise<(string | null)[]> {
  const order = await prisma.order.findUnique({
    where: { orderNo },
    select: { items: { select: { id: true, status: true, canceledAt: true, merchantId: true } } },
  });
  if (!order) return [];

  const lines = linesOfRequest(order.items, { itemIds });
  return missingReturnAddresses(await destinationsFor(lines));
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
  /*
   * **쓰기 전에 명단을 잡는다.** 지금 이 주소로 보내라고 안내받고 있는 사람들이다 — 쓴 뒤에 세면 같은
   * 명단이 나오지만, 잡는 시점이 뜻을 갖는 자리라 순서를 분명히 둔다.
   */
  const [before, affected] = await Promise.all([
    getReturnAddress(merchantId),
    awaitingReturnsFor(merchantId),
  ]);
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
  const after = toAddress(row);

  /*
   * **아직 보내지 않은 사람만 구할 수 있다.** 이미 상자에 옛 주소를 적어 보낸 사람에게는 그 주소를 아는
   * 사람이 받아 줘야 하고, 그것은 운영의 일이다. 알림이 실패해도 주소는 이미 바뀌었다.
   */
  if (returnAddressChanged(before, after)) await notifyReturnAddressChanged(affected);

  /*
   * **"보낼 곳이 없다" 는 알림은 끝난 일이다.** 등록하러 온 사람이 바로 이 사람이고, 등록한 뒤에도
   * 그 알림이 안 읽음으로 남으면 뱃지가 할 일의 수를 말하지 않는다. 처음 등록한 때만이 아니라 고칠
   * 때도 닫는다 — 미등록 알림이 남아 있는데 주소가 멀쩡한 경우가 그쪽이다.
   */
  await clearReturnAddressMissing(merchantId);

  return { before, after };
}

/**
 * 이 반품지로 **보내라고 안내받은** 신청.
 *
 * 승인했고 아직 도착하지 않은 신청 중, 그 줄의 판매처가 이 반품지인 것(core showsReturnAddress·
 * linesOfRequest 와 같은 규칙). 바꾸기 전에 몇 건인지 말해 주고, 바꾼 뒤에는 그 손님들에게 알린다.
 *
 * **줄을 JS 에서 고른다.** 옛 신청은 `itemIds` 가 비어 있어 "반품접수인 줄 전부" 를 뜻하는데, 그 규칙을
 * SQL 로 옮겨 적으면 손님 화면과 갈린다. 승인·회수 대기는 처리할 일의 목록이라 줄 수가 적다.
 */
export async function awaitingReturnsFor(
  merchantId: string | null,
): Promise<{ orderNo: string; userId: string }[]> {
  const requests = await prisma.returnRequest.findMany({
    where: { status: 'APPROVED', receivedAt: null },
    select: {
      itemIds: true,
      order: {
        select: {
          orderNo: true,
          userId: true,
          items: { select: { id: true, status: true, canceledAt: true, merchantId: true } },
        },
      },
    },
  });

  return requests
    .filter((r) => linesOfRequest(r.order.items, r).some((line) => line.merchantId === merchantId))
    .map((r) => ({ orderNo: r.order.orderNo, userId: r.order.userId }));
}
