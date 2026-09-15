/**
 * 반품지 — 돌려보낸 물건이 어디로 가는지. 순수 로직만.
 *
 * **물건을 받는 곳은 판매자다.** 가맹점 상품은 그 가맹점 창고로, 자사 브랜드(가맹점이 없는 줄)는 플랫폼 반품지로 간다.
 * 반품을 승인해 놓고 보낼 곳을 알려 주지 않으면 손님은 고객센터에 묻거나, 받은 상자에 적힌 출고지로 보낸다 — 출고지가
 * 물류 대행사면 물건이 엉뚱한 곳에 도착해 아무도 도착을 확인하지 못한다.
 */

import { normalizePhone } from './address';

/** 플랫폼 반품지의 열쇠. 가맹점 반품지는 가맹점 id 가 열쇠다 */
export const PLATFORM_RETURN_ADDRESS_ID = 'platform';

export interface ReturnAddress {
  readonly recipient: string;
  readonly phone: string;
  readonly postalCode: string;
  readonly address1: string;
  readonly address2: string | null;
}

/** 손님 화면·메일에 적을 한 줄 주소 — 우편번호를 앞에 둔다(송장에 옮겨 적는 순서) */
export function returnAddressLine(a: ReturnAddress): string {
  return `(${a.postalCode}) ${a.address1}${a.address2 ? ` ${a.address2}` : ''}`;
}

/** 저장할 모양 — 연락처를 한 모양으로, 빈 상세주소는 null 로 */
export function normalizeReturnAddress(a: {
  recipient: string;
  phone: string;
  postalCode: string;
  address1: string;
  address2?: string | null | undefined;
}): ReturnAddress {
  const detail = a.address2?.trim() ?? '';
  return {
    recipient: a.recipient.trim(),
    phone: normalizePhone(a.phone),
    postalCode: a.postalCode.trim(),
    address1: a.address1.trim(),
    address2: detail === '' ? null : detail,
  };
}

/** 한 판매처로 돌려보낼 줄들. `merchantId` 가 null 이면 자사 상품(플랫폼 반품지) */
export interface ReturnDestination {
  readonly merchantId: string | null;
  readonly address: ReturnAddress | null;
  readonly itemIds: readonly string[];
}

/**
 * 신청한 줄을 판매처별로 묶고 반품지를 붙인다.
 *
 * 한 주문에 두 가맹점 상품을 돌려보내면 **상자가 둘**이다. 한 주소만 적어 주면 한쪽 물건이 남의 창고로 간다.
 * 순서는 줄이 처음 나온 순서 — 손님이 주문 화면에서 보는 순서와 같게.
 */
export function returnDestinations(
  lines: readonly { readonly id: string; readonly merchantId: string | null }[],
  addressOf: (merchantId: string | null) => ReturnAddress | null,
): ReturnDestination[] {
  const groups = new Map<string | null, string[]>();
  for (const line of lines) {
    const ids = groups.get(line.merchantId);
    if (ids) ids.push(line.id);
    else groups.set(line.merchantId, [line.id]);
  }
  return [...groups].map(([merchantId, itemIds]) => ({ merchantId, address: addressOf(merchantId), itemIds }));
}

/**
 * 반품지가 없는 판매처. 비어 있어야 승인할 수 있다.
 *
 * **보낼 곳이 없으면 승인하지 않는다.** 승인 알림이 "상품을 보내 주세요" 인데 어디로인지 없으면 손님이 할 수 있는 일이
 * 없고, 그 신청은 아무도 도착을 확인할 수 없는 채 대기열에 남는다. 반품지를 먼저 등록하게 막는 편이 낫다.
 */
export function missingReturnAddresses(destinations: readonly ReturnDestination[]): (string | null)[] {
  return destinations.filter((d) => d.address === null).map((d) => d.merchantId);
}

/**
 * 손님에게 보낼 곳을 보여 줄 때인가 — 승인했고 아직 물건이 도착하지 않았을 때.
 *
 * 승인 전에 보여 주면 반려될 신청의 물건을 먼저 보낸다. 도착한 뒤에는 보낼 일이 없다.
 */
export function showsReturnAddress(request: { readonly status: string; readonly receivedAt: Date | null }): boolean {
  return request.status === 'APPROVED' && request.receivedAt === null;
}
