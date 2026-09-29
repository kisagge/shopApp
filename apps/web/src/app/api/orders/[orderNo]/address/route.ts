import { NextResponse } from 'next/server';
import { getSessionUser } from '@shop/auth/session';
import { updateOrderAddressSchema } from '@shop/contract';
import { updateOrderAddress } from '~/lib/orders/update-address';
import { apiError, unauthorized } from '~/lib/api/respond';
import { readBody } from '~/lib/api/read-body';
import { enforceRateLimit } from '~/lib/rate-limit';

/**
 * 손님이 자기 주문의 배송지를 고친다.
 *
 * **아무도 못 고쳤다.** 상세주소를 잘못 적으면 출고 전이라도 방법이 없어, 취소하고 다시 사거나
 * 1:1 문의로 부탁해야 했다 — 운영자도 화면에서 할 수 없어 결국 DB 를 직접 만졌고, 그사이 송장이
 * 나가면 오배송이다.
 *
 * 언제까지 되는지와 도서산간 여부가 바뀔 때의 셈은 core 가 정한다.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ orderNo: string }> },
): Promise<NextResponse> {
  const user = await getSessionUser(request.headers);
  if (!user) {
    return await unauthorized();
  }
  // 몸통을 읽기 전에 건다 — 거절할 요청의 본문을 읽고 검증하는 일 자체가 비용이다
  const limited = await enforceRateLimit('write', request, user.id);
  if (limited) return limited;

  const parsed = await readBody(request, updateOrderAddressSchema);
  if (!parsed.ok) return parsed.response;

  const { orderNo } = await params;

  try {
    const { orderNo: no, shippingDelta, shippingFee, payable, isRemoteArea } =
      await updateOrderAddress(orderNo, parsed.data, { userId: user.id });
    // 바꾸기 전 주소(before)는 돌려주지 않는다 — 화면이 쓸 일이 없고, 감사 로그가 쓰는 값이다
    return NextResponse.json({ orderNo: no, shippingDelta, shippingFee, payable, isRemoteArea });
  } catch (error) {
    return await apiError(error);
  }
}
