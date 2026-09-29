import { NextResponse } from 'next/server';
import { getActor } from '@shop/auth/session';
import { updateOrderAddressSchema } from '@shop/contract';
import { updateOrderAddressAsAdmin } from '~/lib/admin/manage-order-address';
import { recordAudit } from '~/lib/audit';
import { apiError, unauthorized } from '~/lib/api/respond';
import { readBody } from '~/lib/api/read-body';

/**
 * 운영진·가맹점이 주문의 배송지를 고친다.
 *
 * **고쳐 달라는 전화를 받고도 할 수 있는 것이 없었다.** 손님 쪽 창구가 생긴 뒤에도 운영자에게는 화면이
 * 없어서, 동·호수를 빠뜨린 주문이 오면 DB 를 직접 만지거나 취소하고 다시 주문하게 해야 했다.
 *
 * **남의 주소를 대신 바꾸는 일이라 기록을 남긴다.** 물건이 어디로 가는지를 정하는 값이고, 나중에
 * "누가 언제 무엇을 무엇으로 바꿨는지" 를 물을 수밖에 없는 자리다.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ orderNo: string }> },
): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return await unauthorized();
  }

  const parsed = await readBody(request, updateOrderAddressSchema);
  if (!parsed.ok) return parsed.response;

  const { orderNo } = await params;

  try {
    const result = await updateOrderAddressAsAdmin(actor, orderNo, parsed.data);
    await recordAudit({
      actor,
      action: 'order.address',
      targetType: 'order',
      targetId: result.orderNo,
      before: result.before,
      after: result.after,
      request,
    });
    return NextResponse.json(result);
  } catch (error) {
    return await apiError(error);
  }
}
