import 'server-only';
import { hasPermission, merchantScope, type Actor } from '@shop/core';
import type { updateOrderAddressSchema } from '@shop/contract';
import type { z } from 'zod';
import { updateOrderAddress, AddressEditError, type AddressEditResult } from '~/lib/orders/update-address';

/**
 * 운영진·가맹점이 주문의 배송지를 고친다.
 *
 * **고쳐 달라는 전화를 받고도 할 수 있는 것이 없었다.** 손님 쪽 창구를 열었지만 운영자에게는 여전히 화면이
 * 없어서, 동·호수를 빠뜨린 주문이 오면 DB 를 직접 만지거나 "취소하고 다시 주문해 주세요" 라고 말해야 했다.
 * 출고 직전에 그 말을 듣는 사람이 가장 곤란하다.
 *
 * 언제까지 되는지와 도서산간 여부가 바뀔 때의 셈은 손님 쪽과 **같은 규칙**을 쓴다(checkAddressEdit).
 * 운영자라고 이미 나간 주문의 주소를 바꿀 수 있으면, 화면에는 새 주소가 보이는데 물건은 옛 주소로 간다.
 *
 * 가맹점은 자기 상품이 담긴 주문만 연다 — 송장 등록과 같은 범위다(merchantScope).
 */
export async function updateOrderAddressAsAdmin(
  actor: Actor,
  orderNo: string,
  input: z.infer<typeof updateOrderAddressSchema>,
): Promise<AddressEditResult> {
  // 주소를 보고 송장을 붙이는 사람이 고치는 사람이다 — 출고 권한과 같은 자리에 둔다
  if (!hasPermission(actor, 'order:fulfill')) {
    throw new AddressEditError('FORBIDDEN', 403);
  }

  const scope = merchantScope(actor);
  if (scope === undefined) throw new AddressEditError('FORBIDDEN', 403);

  return await updateOrderAddress(orderNo, input, scope ? { merchantId: scope } : {});
}
